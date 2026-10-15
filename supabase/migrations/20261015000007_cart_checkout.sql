-- Stage 2 (review 14.10.2026): cart and multi-item orders.
--
--   checkouts    one purchase by a customer (one simulated payment for the whole cart)
--   orders       one per butcher inside a checkout (the shop picks and packs it as a single order)
--   order_items  the cut lines of an order; each line can be cancelled on its own
--
-- Adding to the cart reserves nothing. place_checkout locks every cut in the cart and either buys all of it
-- or nothing (CART_UNAVAILABLE lists what is missing). Existing single-cut orders are migrated as one-line orders.

-- ───────── tables ─────────
create sequence checkout_number_seq start 5001;
create table checkouts (
  id               uuid primary key default gen_random_uuid(),
  checkout_number  int unique not null default nextval('checkout_number_seq'),
  idempotency_key  uuid unique not null,
  customer_id      uuid not null references profiles(id),
  total_agorot     int not null default 0,            -- what was charged at purchase (simulated payment)
  payment_status   text not null default 'simulated',
  created_at       timestamptz not null default now()
);
create index on checkouts (customer_id, created_at desc);

create type order_item_status as enum ('active', 'cancelled');
create table order_items (
  id                   uuid primary key default gen_random_uuid(),
  order_id             uuid not null references orders(id) on delete cascade,
  cut_id               uuid not null references cuts(id),
  mode                 order_mode not null,
  steaks_qty           int,
  est_weight_g         int not null,
  price_per_kg_agorot  int not null,                   -- the price the item was bought at
  total_agorot         int not null,
  status               order_item_status not null default 'active',
  cancel_reason        text,
  cancelled_by         user_role,
  cancelled_at         timestamptz,
  restocked            boolean,                        -- whether a cancellation returned the meat to stock
  created_at           timestamptz not null default now()
);
create index on order_items (order_id);
create index on order_items (cut_id, status);

-- ───────── migrate single-cut orders ─────────
alter table orders add column checkout_id uuid references checkouts(id);

insert into checkouts (idempotency_key, customer_id, total_agorot, payment_status, created_at)
select idempotency_key, customer_id, total_agorot, payment_status, created_at from orders;

update orders o set checkout_id = c.id from checkouts c where c.idempotency_key = o.idempotency_key;

insert into order_items (order_id, cut_id, mode, steaks_qty, est_weight_g, price_per_kg_agorot, total_agorot, created_at)
select o.id, o.cut_id, o.mode, o.steaks_qty, o.est_weight_g, o.price_per_kg_agorot, o.total_agorot, o.created_at
from orders o;
-- an order cancelled before this migration keeps its item as part of the order's history
update order_items i set status = 'cancelled', cancel_reason = o.cancel_reason, cancelled_by = o.cancelled_by,
                         cancelled_at = o.updated_at, restocked = true
from orders o where o.id = i.order_id and o.status = 'cancelled';

alter table orders alter column checkout_id set not null;
create index on orders (checkout_id);
alter table orders
  drop column idempotency_key,
  drop column cut_id,
  drop column mode,
  drop column steaks_qty,
  drop column est_weight_g,
  drop column price_per_kg_agorot;
-- orders.total_agorot = sum of its active items (kept as the last value when the whole order is cancelled)

-- ───────── helpers ─────────
create or replace function cut_has_active_orders(p_cut_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from order_items i join orders o on o.id = i.order_id
                 where i.cut_id = p_cut_id and i.status = 'active' and o.status in ('new','preparing','ready'))
$$;

-- anything ever sold from this cut online that was not cancelled (completed orders included)
create or replace function cut_has_sales(p_cut_id uuid, p_except_item uuid default null) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from order_items i
                 where i.cut_id = p_cut_id and i.status = 'active' and i.id is distinct from p_except_item)
$$;

-- Return one item's meat to its cut (used by cancellations). The cut row must already be locked by the caller.
create or replace function return_item_stock(i order_items, p_actor uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare
  c cuts;
  v_delta int;
  v_whole boolean;
begin
  select * into c from cuts where id = i.cut_id;
  -- a withdrawn cut stays withdrawn
  if c.status not in ('published','sold_out') then return; end if;

  if i.mode = 'whole' then
    v_delta := c.steaks_total - c.steaks_available;
  else
    v_delta := least(i.steaks_qty, c.steaks_total - c.steaks_available);
  end if;

  v_whole := c.sale_mode in ('whole','both') and (c.steaks_available + v_delta) = c.steaks_total
             and not exists (select 1 from stock_events s where s.cut_id = c.id and s.type = 'store_sale')
             and not cut_has_sales(c.id, i.id);

  perform set_config('solor.rpc', 'on', true);
  update cuts set
    steaks_available = steaks_available + v_delta,
    whole_available  = v_whole,
    status           = case when steaks_available + v_delta > 0 or v_whole then 'published'::cut_status else status end,
    sold_out_at      = case when steaks_available + v_delta > 0 or v_whole then null else sold_out_at end
  where id = c.id
  returning * into c;
  perform set_config('solor.rpc', 'off', true);

  insert into stock_events (cut_id, type, steaks_delta, whole_after, order_id, actor_id, reason)
  values (c.id, 'order_cancel', v_delta, c.whole_available, i.order_id, p_actor, p_reason);
end $$;

-- ───────── edit guard: "sold" now means an active order line ─────────
create or replace function cuts_guard_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  content_changed boolean;
  stock_changed boolean;
  missing text[];
  st record;
begin
  if coalesce(current_setting('solor.rpc', true), '') = 'on' then
    return new;
  end if;

  if new.id <> old.id or new.code <> old.code or new.butcher_id <> old.butcher_id then
    raise exception 'NOT_ALLOWED';
  end if;

  if old.status = 'withdrawn' then
    raise exception 'NOT_ALLOWED';
  end if;

  if old.status = 'draft' then
    return new;
  end if;

  content_changed :=
       new.cut_type            is distinct from old.cut_type
    or new.breed_key           is distinct from old.breed_key
    or new.breed_other         is distinct from old.breed_other
    or new.origin_country      is distinct from old.origin_country
    or new.is_aged             is distinct from old.is_aged
    or new.aging_days          is distinct from old.aging_days
    or new.aging_method        is distinct from old.aging_method
    or new.weight_g            is distinct from old.weight_g
    or new.price_per_kg_agorot is distinct from old.price_per_kg_agorot
    or new.sale_mode           is distinct from old.sale_mode
    or new.steak_weight_g      is distinct from old.steak_weight_g
    or new.steak_thickness_cm  is distinct from old.steak_thickness_cm
    or new.steaks_planned      is distinct from old.steaks_planned;

  if content_changed and cut_has_active_orders(old.id) then
    raise exception 'HAS_ACTIVE_ORDERS';
  end if;

  stock_changed :=
       new.weight_g       is distinct from old.weight_g
    or new.sale_mode      is distinct from old.sale_mode
    or new.steak_weight_g is distinct from old.steak_weight_g
    or new.steaks_planned is distinct from old.steaks_planned;

  if stock_changed then
    if old.status <> 'published'
       or cut_has_sales(old.id)
       or exists (select 1 from stock_events s where s.cut_id = old.id and s.type = 'store_sale')
    then
      raise exception 'STOCK_CHANGED';
    end if;
  end if;

  missing := cut_missing_fields(new);
  if array_length(missing, 1) > 0 then
    raise exception 'MISSING_FIELDS' using detail = array_to_string(missing, ',');
  end if;

  if stock_changed then
    st := compute_stock(new);
    insert into stock_events (cut_id, type, steaks_delta, whole_after, actor_id, reason)
    values (new.id, 'manual_adjust', st.steaks_total - old.steaks_available, st.whole_available, auth.uid(), 'edit');
    new.steaks_total     := st.steaks_total;
    new.steaks_available := st.steaks_total;
    new.whole_available  := st.whole_available;
  end if;

  return new;
end $$;

create or replace function revert_to_draft(p_cut_id uuid) returns cuts
language plpgsql security definer set search_path = public as $$
declare
  v_bid uuid := current_butcher_id();
  c cuts;
begin
  if v_bid is null then raise exception 'NOT_ALLOWED'; end if;
  select * into c from cuts where id = p_cut_id for update;
  if not found or c.butcher_id <> v_bid then raise exception 'NOT_ALLOWED'; end if;
  if c.status <> 'published' then raise exception 'INVALID_TRANSITION'; end if;
  if exists (select 1 from order_items where cut_id = c.id) then raise exception 'HAS_ACTIVE_ORDERS'; end if;
  if exists (select 1 from stock_events where cut_id = c.id and type = 'store_sale') then
    raise exception 'STOCK_CHANGED';
  end if;

  perform set_config('solor.rpc', 'on', true);
  update cuts set status = 'draft', published_at = null, sold_out_at = null,
                  steaks_total = 0, steaks_available = 0, whole_available = false
  where id = c.id returning * into c;
  perform set_config('solor.rpc', 'off', true);

  insert into stock_events (cut_id, type, steaks_delta, whole_after, actor_id, reason)
  values (c.id, 'manual_adjust', 0, false, auth.uid(), 'revert_to_draft');
  return c;
end $$;

-- ───────── place_checkout: the whole cart, all or nothing ─────────
-- p_items: [{"cut_id": uuid, "mode": "whole"|"steaks", "steaks_qty": int|null}, ...]  (one line per cut)
-- p_notes: {"<butcher_id>": "note for that shop", ...}
create or replace function place_checkout(p_items jsonb, p_idempotency_key uuid, p_notes jsonb default '{}'::jsonb)
returns checkouts
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  k checkouts;
  o orders;
  c cuts;
  it jsonb;
  v_ids uuid[];
  v_mode order_mode;
  v_qty int;
  v_weight int;
  v_total int;
  v_delta int;
  v_problems jsonb := '[]'::jsonb;
  v_bid uuid;
  v_note text;
begin
  if v_uid is null or current_role_of_user() is distinct from 'customer' then
    raise exception 'NOT_ALLOWED';
  end if;
  if p_idempotency_key is null then raise exception 'INVALID_CART'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 30 then
    raise exception 'INVALID_CART';
  end if;
  if p_notes is not null and jsonb_typeof(p_notes) <> 'object' then raise exception 'INVALID_CART'; end if;
  if exists (select 1 from jsonb_each_text(coalesce(p_notes, '{}')) where char_length(value) > 300) then
    raise exception 'NOTE_TOO_LONG';
  end if;

  -- idempotency (fast path)
  select * into k from checkouts where idempotency_key = p_idempotency_key;
  if found then
    if k.customer_id <> v_uid then raise exception 'NOT_ALLOWED'; end if;
    return k;
  end if;

  select array_agg((e->>'cut_id')::uuid) into v_ids from jsonb_array_elements(p_items) e;
  if array_position(v_ids, null) is not null
     or (select count(distinct x) from unnest(v_ids) x) <> array_length(v_ids, 1) then
    raise exception 'INVALID_CART';   -- missing or duplicate cut
  end if;

  -- lock every cut in a stable order: concurrent carts that share cuts queue here without deadlocks
  perform 1 from cuts where id = any(v_ids) order by id for update;

  -- idempotency (after waiting on the locks, a parallel duplicate may have committed)
  select * into k from checkouts where idempotency_key = p_idempotency_key;
  if found then
    if k.customer_id <> v_uid then raise exception 'NOT_ALLOWED'; end if;
    return k;
  end if;

  -- validate every line first; report all problems at once
  for it in select * from jsonb_array_elements(p_items) loop
    select * into c from cuts where id = (it->>'cut_id')::uuid;
    if not found then
      v_problems := v_problems || jsonb_build_object('cut_id', it->>'cut_id', 'reason', 'CUT_NOT_AVAILABLE');
      continue;
    end if;
    begin
      v_mode := (it->>'mode')::order_mode;
    exception when others then
      raise exception 'INVALID_CART';
    end;
    v_qty := nullif(it->>'steaks_qty', '')::int;

    if c.status not in ('published','sold_out') or (v_mode = 'whole' and c.status = 'sold_out') then
      v_problems := v_problems || jsonb_build_object('cut_id', c.id, 'code', c.code, 'reason', 'CUT_NOT_AVAILABLE');
    elsif v_mode = 'whole' then
      if c.sale_mode not in ('whole','both') or not c.whole_available or c.steaks_available <> c.steaks_total then
        v_problems := v_problems || jsonb_build_object('cut_id', c.id, 'code', c.code, 'reason', 'WHOLE_NOT_AVAILABLE');
      end if;
    else
      if c.sale_mode not in ('steaks','both') then
        v_problems := v_problems || jsonb_build_object('cut_id', c.id, 'code', c.code, 'reason', 'CUT_NOT_AVAILABLE');
      elsif v_qty is null or v_qty < 1 then
        raise exception 'INVALID_QTY';
      elsif v_qty > c.steaks_available then
        v_problems := v_problems || jsonb_build_object('cut_id', c.id, 'code', c.code, 'reason', 'NOT_ENOUGH_STEAKS',
                                                       'available', c.steaks_available);
      end if;
    end if;
  end loop;

  if jsonb_array_length(v_problems) > 0 then
    raise exception 'CART_UNAVAILABLE' using detail = v_problems::text;
  end if;

  insert into checkouts (idempotency_key, customer_id) values (p_idempotency_key, v_uid) returning * into k;

  -- one order per shop
  for v_bid in select distinct cu.butcher_id from cuts cu where cu.id = any(v_ids) order by 1 loop
    v_note := nullif(trim(coalesce(p_notes->>v_bid::text, '')), '');
    insert into orders (checkout_id, customer_id, butcher_id, total_agorot, customer_note)
    values (k.id, v_uid, v_bid, 0, v_note)
    returning * into o;

    for it in select e from jsonb_array_elements(p_items) e
              join cuts cu on cu.id = (e->>'cut_id')::uuid and cu.butcher_id = v_bid loop
      select * into c from cuts where id = (it->>'cut_id')::uuid;
      v_mode := (it->>'mode')::order_mode;
      if v_mode = 'whole' then
        v_qty    := null;
        v_weight := c.weight_g;
        v_total  := price_for_weight(c.weight_g, c.price_per_kg_agorot);
        v_delta  := -c.steaks_available;
      else
        v_qty    := (it->>'steaks_qty')::int;
        v_weight := c.steak_weight_g * v_qty;
        v_total  := price_for_weight(c.steak_weight_g, c.price_per_kg_agorot) * v_qty;
        v_delta  := -v_qty;
      end if;

      insert into order_items (order_id, cut_id, mode, steaks_qty, est_weight_g, price_per_kg_agorot, total_agorot)
      values (o.id, c.id, v_mode, v_qty, v_weight, c.price_per_kg_agorot, v_total);

      perform set_config('solor.rpc', 'on', true);
      update cuts set
        steaks_available = steaks_available + v_delta,
        whole_available  = false,
        status           = case when steaks_available + v_delta = 0 then 'sold_out'::cut_status else status end,
        sold_out_at      = case when steaks_available + v_delta = 0 then now() else sold_out_at end
      where id = c.id
      returning * into c;
      perform set_config('solor.rpc', 'off', true);

      insert into stock_events (cut_id, type, steaks_delta, whole_after, order_id, actor_id)
      values (c.id, 'order', v_delta, c.whole_available, o.id, v_uid);
    end loop;

    update orders set total_agorot = (select sum(total_agorot) from order_items where order_id = o.id)
    where id = o.id;
    insert into order_events (order_id, from_status, to_status, actor_id) values (o.id, null, 'new', v_uid);
  end loop;

  update checkouts set total_agorot = (select sum(total_agorot) from orders where checkout_id = k.id)
  where id = k.id returning * into k;
  return k;
end $$;

-- ───────── cancel a whole shop order ─────────
-- customer: own order while 'new'. butcher: own shop before completed, with a reason. Returns the stock.
drop function if exists cancel_order(uuid, text);
create function cancel_order(p_order_id uuid, p_reason text default null) returns orders
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role user_role := current_role_of_user();
  v_bid uuid := current_butcher_id();
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  o orders;
  i order_items;
  v_from order_status;
begin
  if v_uid is null or v_role is null then raise exception 'NOT_ALLOWED'; end if;

  select * into o from orders where id = p_order_id for update;
  if not found then raise exception 'NOT_ALLOWED'; end if;

  if v_role = 'customer' then
    if o.customer_id <> v_uid then raise exception 'NOT_ALLOWED'; end if;
    if o.status <> 'new' then raise exception 'INVALID_TRANSITION'; end if;
  else
    if o.butcher_id is distinct from v_bid then raise exception 'NOT_ALLOWED'; end if;
    if o.status in ('completed','cancelled') then raise exception 'INVALID_TRANSITION'; end if;
    if v_reason is null then raise exception 'REASON_REQUIRED'; end if;
  end if;

  perform 1 from cuts where id in (select cut_id from order_items where order_id = o.id) order by id for update;

  for i in select * from order_items where order_id = o.id and status = 'active' loop
    update order_items set status = 'cancelled', cancel_reason = v_reason, cancelled_by = v_role,
                           cancelled_at = now(), restocked = true
    where id = i.id;
    perform return_item_stock(i, v_uid, v_reason);
  end loop;

  v_from := o.status;
  update orders set status = 'cancelled', cancel_reason = v_reason, cancelled_by = v_role
  where id = o.id returning * into o;
  insert into order_events (order_id, from_status, to_status, actor_id, note)
  values (o.id, v_from, 'cancelled', v_uid, v_reason);
  return o;
end $$;

-- ───────── cancel one line of an order ─────────
-- customer: own order while 'new' (meat always returns to stock).
-- butcher: own shop before completed, with a reason; p_restock decides whether the meat goes back on sale.
-- Cancelling the last active line cancels the order.
create or replace function cancel_order_item(p_item_id uuid, p_reason text default null, p_restock boolean default true)
returns orders
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role user_role := current_role_of_user();
  v_bid uuid := current_butcher_id();
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_restock boolean;
  i order_items;
  o orders;
  v_from order_status;
begin
  if v_uid is null or v_role is null then raise exception 'NOT_ALLOWED'; end if;

  select * into i from order_items where id = p_item_id;
  if not found then raise exception 'NOT_ALLOWED'; end if;
  select * into o from orders where id = i.order_id for update;

  if v_role = 'customer' then
    if o.customer_id <> v_uid then raise exception 'NOT_ALLOWED'; end if;
    if o.status <> 'new' then raise exception 'INVALID_TRANSITION'; end if;
    v_restock := true;
  else
    if o.butcher_id is distinct from v_bid then raise exception 'NOT_ALLOWED'; end if;
    if o.status in ('completed','cancelled') then raise exception 'INVALID_TRANSITION'; end if;
    if v_reason is null then raise exception 'REASON_REQUIRED'; end if;
    v_restock := coalesce(p_restock, true);
  end if;

  perform 1 from cuts where id = i.cut_id for update;
  select * into i from order_items where id = p_item_id;          -- re-read under the locks
  if i.status <> 'active' then raise exception 'INVALID_TRANSITION'; end if;

  update order_items set status = 'cancelled', cancel_reason = v_reason, cancelled_by = v_role,
                         cancelled_at = now(), restocked = v_restock
  where id = i.id;
  if v_restock then
    perform return_item_stock(i, v_uid, v_reason);
  end if;

  if exists (select 1 from order_items where order_id = o.id and status = 'active') then
    update orders set total_agorot = (select sum(total_agorot) from order_items where order_id = o.id and status = 'active')
    where id = o.id returning * into o;
  else
    v_from := o.status;
    update orders set status = 'cancelled', cancel_reason = v_reason, cancelled_by = v_role
    where id = o.id returning * into o;
    insert into order_events (order_id, from_status, to_status, actor_id, note)
    values (o.id, v_from, 'cancelled', v_uid, v_reason);
  end if;
  return o;
end $$;

drop function if exists place_order(uuid, order_mode, int, uuid, text);

-- ───────── RLS + grants ─────────
alter table checkouts   enable row level security;
alter table order_items enable row level security;
revoke all on checkouts, order_items from anon, authenticated;
grant select on checkouts, order_items to authenticated;

create policy checkouts_select_customer on checkouts for select to authenticated
  using (customer_id = auth.uid());

create policy order_items_select on order_items for select to authenticated
  using (exists (select 1 from orders o where o.id = order_items.order_id
                 and (o.customer_id = auth.uid() or o.butcher_id = current_butcher_id())));

revoke execute on function
  place_checkout(jsonb, uuid, jsonb), cancel_order(uuid, text), cancel_order_item(uuid, text, boolean),
  return_item_stock(order_items, uuid, text), cut_has_sales(uuid, uuid), cut_has_active_orders(uuid)
from public, anon;
grant execute on function
  place_checkout(jsonb, uuid, jsonb), cancel_order(uuid, text), cancel_order_item(uuid, text, boolean)
to authenticated;
revoke execute on function return_item_stock(order_items, uuid, text), cut_has_sales(uuid, uuid) from authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table order_items;
  end if;
end $$;
