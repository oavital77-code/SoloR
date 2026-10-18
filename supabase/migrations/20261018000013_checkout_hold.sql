-- Checkout (customer spec §10, step 7): contact details, how each shop's part is received, a binding summary,
-- then an atomic stock check that holds the cart for a short while, and only then the payment.
--
--   holds        one checkout attempt: the cart, the receive choices and the summary total, held until expires_at
--   hold_lines   what the attempt holds, per cut (other customers cannot buy it while the hold is active)
--
-- A hold does not touch the cut's stock columns: the feed does not see a held cut as sold, and a hold that runs
-- out simply stops counting. Stock moves only when the payment succeeds (pay_checkout), once per hold.
-- There is no payment provider yet: pay_checkout is the prototype's confirmation ("לא יבוצע חיוב") and is
-- synchronous, so an expired hold has no late payment to wait for. When a provider is added, a hold must be
-- released only after asking the provider about its payment (§10.4).
--
-- Delivery is built but stays off in the pilot (butchers.delivery_enabled = false): with it off, the customer
-- sees no delivery screen and the RPCs refuse a delivery choice.

-- ───────── shop delivery settings (filled by the butcher side; open questions §18.5, §18.9) ─────────
-- delivery_pricing: {"<area>": fee in agorot, "*": fee for any other listed area}; a missing fee is 0.
-- delivery_windows: the time windows the shop offers ("ה׳ 16:00–20:00"); none = "ממתין לתיאום".
alter table butchers
  add column if not exists delivery_pricing jsonb  not null default '{}' check (jsonb_typeof(delivery_pricing) = 'object'),
  add column if not exists delivery_windows text[] not null default '{}';
grant update (delivery_pricing, delivery_windows) on butchers to authenticated;

-- ───────── what was chosen at checkout ─────────
alter table checkouts
  add column if not exists contact_name  text,
  add column if not exists contact_phone text,
  add column if not exists is_demo       boolean not null default true;

alter table orders
  add column if not exists receive_method      text not null default 'pickup' check (receive_method in ('pickup', 'delivery')),
  add column if not exists delivery_address    jsonb,          -- {name, phone, street, city, notes?}; may be someone else
  add column if not exists delivery_window     text,           -- null with delivery = waiting for the shop to coordinate
  add column if not exists delivery_fee_agorot int not null default 0 check (delivery_fee_agorot >= 0);

-- ───────── holds ─────────
create table if not exists holds (
  id              uuid primary key default gen_random_uuid(),
  idempotency_key uuid unique not null,                 -- becomes the checkout's key
  customer_id     uuid not null references profiles(id),
  items           jsonb not null,                       -- the cart lines as sent to reserve_checkout
  receive         jsonb not null,                       -- per shop: {method, address, window, fee_agorot}
  notes           jsonb not null default '{}',
  contact         jsonb not null,                       -- {name, phone}
  items_agorot    int not null,
  fees_agorot     int not null,
  total_agorot    int not null,                         -- the binding summary the customer confirmed
  status          text not null default 'active' check (status in ('active', 'released', 'consumed')),
  expires_at      timestamptz not null,
  checkout_id     uuid references checkouts(id),
  released_at     timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists holds_active_customer on holds (customer_id) where status = 'active';

create table if not exists hold_lines (
  hold_id    uuid not null references holds(id) on delete cascade,
  cut_id     uuid not null references cuts(id),
  mode       order_mode not null,
  steaks_qty int,
  primary key (hold_id, cut_id)
);
create index if not exists hold_lines_cut on hold_lines (cut_id);

-- How long a hold lasts. Open question §10.4 / §18.7; one place to change it.
create or replace function checkout_hold_minutes() returns int language sql immutable as $$ select 10 $$;

-- ───────── helpers (internal) ─────────
-- What other customers' live holds take from a cut.
create or replace function cut_held(p_cut uuid, p_skip_hold uuid)
returns table (steaks int, whole boolean, any_hold boolean)
language sql stable security definer set search_path = public as $$
  select coalesce(sum(case when l.mode = 'steaks' then l.steaks_qty else 0 end), 0)::int,
         coalesce(bool_or(l.mode = 'whole'), false),
         count(*) > 0
  from hold_lines l join holds h on h.id = l.hold_id
  where l.cut_id = p_cut and h.status = 'active' and h.expires_at > now() and h.id is distinct from p_skip_hold
$$;

create or replace function checkout_line_total(c cuts, p_mode order_mode, p_qty int) returns int
language sql immutable as $$
  select case when p_mode = 'whole' then price_for_weight(c.weight_g, c.price_per_kg_agorot)
              else price_for_weight(c.steak_weight_g, c.price_per_kg_agorot) * p_qty end
$$;

-- Checks the shape of the cart and locks its cuts in a stable order (concurrent carts sharing cuts queue here
-- without deadlocks). Returns the cut ids.
create or replace function checkout_lock(p_items jsonb) returns uuid[]
language plpgsql security definer set search_path = public as $$
declare
  v_ids uuid[];
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 30 then
    raise exception 'INVALID_CART';
  end if;
  begin
    select array_agg((e->>'cut_id')::uuid) into v_ids from jsonb_array_elements(p_items) e;
  exception when others then
    raise exception 'INVALID_CART';
  end;
  if array_position(v_ids, null) is not null
     or (select count(distinct x) from unnest(v_ids) x) <> array_length(v_ids, 1) then
    raise exception 'INVALID_CART';   -- missing or duplicate cut
  end if;
  perform 1 from cuts where id = any(v_ids) order by id for update;
  return v_ids;
end $$;

-- Every line that cannot be bought now, all at once; holds other than p_skip_hold count as taken.
-- The caller must hold the cut locks (checkout_lock).
create or replace function checkout_problems(p_items jsonb, p_skip_hold uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  it jsonb;
  c cuts;
  h record;
  v_mode order_mode;
  v_qty int;
  v_free int;
  v_problems jsonb := '[]'::jsonb;
begin
  for it in select * from jsonb_array_elements(p_items) loop
    select * into c from cuts where id = (it->>'cut_id')::uuid;
    if not found then
      v_problems := v_problems || jsonb_build_object('cut_id', it->>'cut_id', 'reason', 'CUT_NOT_AVAILABLE');
      continue;
    end if;
    begin
      v_mode := (it->>'mode')::order_mode;
      v_qty := nullif(it->>'steaks_qty', '')::int;
    exception when others then
      raise exception 'INVALID_CART';
    end;
    select * into h from cut_held(c.id, p_skip_hold);

    if c.status not in ('published','sold_out') or (v_mode = 'whole' and c.status = 'sold_out') then
      v_problems := v_problems || jsonb_build_object('cut_id', c.id, 'code', c.code, 'reason', 'CUT_NOT_AVAILABLE');
    elsif v_mode = 'whole' then
      if c.sale_mode not in ('whole','both') or not c.whole_available or c.steaks_available <> c.steaks_total then
        v_problems := v_problems || jsonb_build_object('cut_id', c.id, 'code', c.code, 'reason', 'WHOLE_NOT_AVAILABLE');
      elsif h.any_hold then
        v_problems := v_problems || jsonb_build_object('cut_id', c.id, 'code', c.code, 'reason', 'CUT_RESERVED');
      end if;
    else
      if c.sale_mode not in ('steaks','both') then
        v_problems := v_problems || jsonb_build_object('cut_id', c.id, 'code', c.code, 'reason', 'CUT_NOT_AVAILABLE');
      elsif v_qty is null or v_qty < 1 then
        raise exception 'INVALID_QTY';
      elsif v_qty > c.steaks_available then
        v_problems := v_problems || jsonb_build_object('cut_id', c.id, 'code', c.code, 'reason', 'NOT_ENOUGH_STEAKS',
                                                       'available', c.steaks_available);
      else
        v_free := case when h.whole then 0 else c.steaks_available - h.steaks end;
        if v_qty > v_free then
          v_problems := v_problems || case when v_free <= 0
            then jsonb_build_object('cut_id', c.id, 'code', c.code, 'reason', 'CUT_RESERVED')
            else jsonb_build_object('cut_id', c.id, 'code', c.code, 'reason', 'NOT_ENOUGH_STEAKS', 'available', v_free) end;
        end if;
      end if;
    end if;
  end loop;
  return v_problems;
end $$;

-- How each shop's part is received, checked against what the shop turned on; returns {"<butcher_id>": {...}}.
-- A shop missing from p_receive gets pickup when the shop offers it.
create or replace function checkout_receive(p_bids uuid[], p_receive jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  b butchers;
  r jsonb;
  a jsonb;
  v_method text;
  v_city text;
  v_area text;
  v_window text;
  v_out jsonb := '{}'::jsonb;
begin
  if p_receive is not null and jsonb_typeof(p_receive) <> 'object' then raise exception 'INVALID_CART'; end if;
  for b in select * from butchers where id = any(p_bids) order by id loop
    r := coalesce(p_receive->(b.id::text), '{}'::jsonb);
    v_method := coalesce(r->>'method', case when b.pickup_enabled then 'pickup' when b.delivery_enabled then 'delivery' end);
    if v_method is null
       or (v_method = 'pickup' and not b.pickup_enabled)
       or (v_method = 'delivery' and not b.delivery_enabled)
       or v_method not in ('pickup', 'delivery') then
      raise exception 'RECEIVE_NOT_AVAILABLE' using detail = b.id::text;
    end if;

    if v_method = 'pickup' then
      v_out := v_out || jsonb_build_object(b.id::text,
        jsonb_build_object('method', 'pickup', 'address', null, 'window', null, 'fee_agorot', 0));
      continue;
    end if;

    a := r->'address';
    if a is null or jsonb_typeof(a) <> 'object'
       or char_length(trim(coalesce(a->>'name', ''))) not between 2 and 80
       or coalesce(a->>'phone', '') !~ '^05[0-9]-[0-9]{7}$'
       or char_length(trim(coalesce(a->>'street', ''))) not between 2 and 120
       or char_length(coalesce(a->>'notes', '')) > 200 then
      raise exception 'INVALID_ADDRESS' using detail = b.id::text;
    end if;
    v_city := trim(coalesce(a->>'city', ''));
    select x into v_area from unnest(b.delivery_areas) x where lower(trim(x)) = lower(v_city) limit 1;
    if v_area is null then raise exception 'DELIVERY_NOT_ELIGIBLE' using detail = b.id::text; end if;
    v_window := nullif(trim(coalesce(r->>'window', '')), '');
    if v_window is not null and not (v_window = any(b.delivery_windows)) then
      raise exception 'INVALID_WINDOW' using detail = b.id::text;
    end if;
    v_out := v_out || jsonb_build_object(b.id::text, jsonb_build_object(
      'method', 'delivery',
      'address', jsonb_build_object('name', trim(a->>'name'), 'phone', a->>'phone', 'street', trim(a->>'street'),
                                    'city', v_area, 'notes', nullif(trim(coalesce(a->>'notes', '')), '')),
      'window', v_window,
      'fee_agorot', greatest(0, coalesce((b.delivery_pricing->>v_area)::int, (b.delivery_pricing->>'*')::int, 0))));
  end loop;
  return v_out;
end $$;

-- ───────── reserve_checkout: check stock and hold the whole cart, all or nothing ─────────
-- p_items:   [{"cut_id", "mode": "whole"|"steaks", "steaks_qty"}]   (one line per cut)
-- p_receive: {"<butcher_id>": {"method": "pickup"|"delivery", "address": {...}, "window": text|null}}
-- p_notes:   {"<butcher_id>": "note for that shop"}
-- p_contact: {"name", "phone"}  (default: the profile's)
-- A customer has one live attempt at a time: a new one releases the previous. The same key returns the same hold.
create or replace function reserve_checkout(p_items jsonb, p_idempotency_key uuid, p_receive jsonb default '{}'::jsonb,
                                            p_notes jsonb default '{}'::jsonb, p_contact jsonb default null)
returns holds
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  h holds;
  p profiles;
  c cuts;
  it jsonb;
  v_ids uuid[];
  v_bids uuid[];
  v_problems jsonb;
  v_receive jsonb;
  v_contact jsonb;
  v_items int := 0;
  v_fees int := 0;
begin
  if v_uid is null or current_role_of_user() is distinct from 'customer' then raise exception 'NOT_ALLOWED'; end if;
  if p_idempotency_key is null then raise exception 'INVALID_CART'; end if;
  if p_notes is not null and jsonb_typeof(p_notes) <> 'object' then raise exception 'INVALID_CART'; end if;
  if exists (select 1 from jsonb_each_text(coalesce(p_notes, '{}')) where char_length(value) > 300) then
    raise exception 'NOTE_TOO_LONG';
  end if;

  select * into h from holds where idempotency_key = p_idempotency_key;
  if found then
    if h.customer_id <> v_uid then raise exception 'NOT_ALLOWED'; end if;
    return h;
  end if;

  v_ids := checkout_lock(p_items);

  -- a parallel duplicate may have committed while this waited on the locks
  select * into h from holds where idempotency_key = p_idempotency_key;
  if found then
    if h.customer_id <> v_uid then raise exception 'NOT_ALLOWED'; end if;
    return h;
  end if;
  if exists (select 1 from checkouts where idempotency_key = p_idempotency_key) then raise exception 'NOT_ALLOWED'; end if;

  update holds set status = 'released', released_at = now() where customer_id = v_uid and status = 'active';

  v_problems := checkout_problems(p_items, null);
  if jsonb_array_length(v_problems) > 0 then
    raise exception 'CART_UNAVAILABLE' using detail = v_problems::text;
  end if;

  select * into p from profiles where id = v_uid;
  v_contact := jsonb_build_object(
    'name', trim(coalesce(p_contact->>'name', p.full_name)),
    'phone', coalesce(p_contact->>'phone', p.phone));
  if char_length(v_contact->>'name') not between 2 and 80 or (v_contact->>'phone') !~ '^05[0-9]-[0-9]{7}$' then
    raise exception 'INVALID_CONTACT';
  end if;

  select array_agg(distinct butcher_id) into v_bids from cuts where id = any(v_ids);
  v_receive := checkout_receive(v_bids, p_receive);

  for it in select * from jsonb_array_elements(p_items) loop
    select * into c from cuts where id = (it->>'cut_id')::uuid;
    v_items := v_items + checkout_line_total(c, (it->>'mode')::order_mode, nullif(it->>'steaks_qty', '')::int);
  end loop;
  select coalesce(sum((value->>'fee_agorot')::int), 0) into v_fees from jsonb_each(v_receive);

  insert into holds (idempotency_key, customer_id, items, receive, notes, contact, items_agorot, fees_agorot, total_agorot, expires_at)
  values (p_idempotency_key, v_uid, p_items, v_receive, coalesce(p_notes, '{}'), v_contact, v_items, v_fees, v_items + v_fees,
          now() + make_interval(mins => checkout_hold_minutes()))
  returning * into h;

  insert into hold_lines (hold_id, cut_id, mode, steaks_qty)
  select h.id, (e->>'cut_id')::uuid, (e->>'mode')::order_mode,
         case when e->>'mode' = 'steaks' then (e->>'steaks_qty')::int end
  from jsonb_array_elements(p_items) e;

  return h;
end $$;

-- ───────── pay_checkout: the (prototype) payment turns a hold into the purchase, once ─────────
-- A hold that ran out is still honoured when its cuts are still free (a late confirmation is not lost);
-- otherwise CART_UNAVAILABLE. A price change since the summary is refused (PRICE_CHANGED): the customer sees the
-- new summary before paying. After either refusal the app releases the hold (release_hold) and starts again.
create or replace function pay_checkout(p_hold_id uuid) returns checkouts
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  h holds;
  k checkouts;
  o orders;
  c cuts;
  it jsonb;
  rc jsonb;
  v_problems jsonb;
  v_bid uuid;
  v_note text;
  v_mode order_mode;
  v_qty int;
  v_weight int;
  v_total int;
  v_delta int;
  v_items int := 0;
begin
  if v_uid is null or current_role_of_user() is distinct from 'customer' then raise exception 'NOT_ALLOWED'; end if;

  select * into h from holds where id = p_hold_id;
  if not found or h.customer_id <> v_uid then raise exception 'NOT_ALLOWED'; end if;
  if h.checkout_id is not null then
    select * into k from checkouts where id = h.checkout_id;
    return k;
  end if;

  perform checkout_lock(h.items);
  select * into h from holds where id = p_hold_id for update;     -- re-read under the locks
  if h.checkout_id is not null then
    select * into k from checkouts where id = h.checkout_id;
    return k;
  end if;
  if h.status = 'released' then raise exception 'HOLD_RELEASED'; end if;

  v_problems := checkout_problems(h.items, h.id);
  if jsonb_array_length(v_problems) > 0 then
    raise exception 'CART_UNAVAILABLE' using detail = v_problems::text;
  end if;

  for it in select * from jsonb_array_elements(h.items) loop
    select * into c from cuts where id = (it->>'cut_id')::uuid;
    v_items := v_items + checkout_line_total(c, (it->>'mode')::order_mode, nullif(it->>'steaks_qty', '')::int);
  end loop;
  if v_items <> h.items_agorot then raise exception 'PRICE_CHANGED'; end if;

  insert into checkouts (idempotency_key, customer_id, contact_name, contact_phone, is_demo)
  values (h.idempotency_key, v_uid, h.contact->>'name', h.contact->>'phone', true)
  returning * into k;

  -- one order per shop
  for v_bid in select distinct cu.butcher_id from cuts cu
               where cu.id in (select (e->>'cut_id')::uuid from jsonb_array_elements(h.items) e) order by 1 loop
    v_note := nullif(trim(coalesce(h.notes->>v_bid::text, '')), '');
    rc := h.receive->(v_bid::text);
    insert into orders (checkout_id, customer_id, butcher_id, total_agorot, customer_note,
                        receive_method, delivery_address, delivery_window, delivery_fee_agorot)
    values (k.id, v_uid, v_bid, 0, v_note,
            coalesce(rc->>'method', 'pickup'), nullif(rc->'address', 'null'::jsonb), rc->>'window',
            coalesce((rc->>'fee_agorot')::int, 0))
    returning * into o;

    for it in select e from jsonb_array_elements(h.items) e
              join cuts cu on cu.id = (e->>'cut_id')::uuid and cu.butcher_id = v_bid loop
      select * into c from cuts where id = (it->>'cut_id')::uuid;
      v_mode := (it->>'mode')::order_mode;
      if v_mode = 'whole' then
        v_qty    := null;
        v_weight := c.weight_g;
        v_delta  := -c.steaks_available;
      else
        v_qty    := (it->>'steaks_qty')::int;
        v_weight := c.steak_weight_g * v_qty;
        v_delta  := -v_qty;
      end if;
      v_total := checkout_line_total(c, v_mode, v_qty);

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

  update checkouts set total_agorot = h.total_agorot where id = k.id returning * into k;
  update holds set status = 'consumed', checkout_id = k.id where id = h.id;
  return k;
end $$;

-- The customer goes back to change the cart or the receive choices: the held cuts are free again at once.
create or replace function release_hold(p_hold_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update holds set status = 'released', released_at = now()
  where id = p_hold_id and customer_id = auth.uid() and status = 'active';
end $$;

-- What is held right now by other customers, for showing "לא זמין כרגע" (no customer data leaves).
create or replace function cut_holds(p_ids uuid[])
returns table (cut_id uuid, steaks_held int, whole_held boolean)
language sql stable security definer set search_path = public as $$
  select l.cut_id,
         coalesce(sum(case when l.mode = 'steaks' then l.steaks_qty else 0 end), 0)::int,
         coalesce(bool_or(l.mode = 'whole'), false)
  from hold_lines l join holds h on h.id = l.hold_id
  where l.cut_id = any(p_ids[1:60]) and h.status = 'active' and h.expires_at > now()
    and h.customer_id is distinct from auth.uid()
  group by l.cut_id
$$;

-- ───────── place_checkout keeps working (hold + pay in one call), now respecting other customers' holds ─────────
create or replace function place_checkout(p_items jsonb, p_idempotency_key uuid, p_notes jsonb default '{}'::jsonb)
returns checkouts
language plpgsql security definer set search_path = public as $$
declare
  k checkouts;
  h holds;
begin
  if auth.uid() is null or current_role_of_user() is distinct from 'customer' then raise exception 'NOT_ALLOWED'; end if;
  select * into k from checkouts where idempotency_key = p_idempotency_key;
  if found then
    if k.customer_id <> auth.uid() then raise exception 'NOT_ALLOWED'; end if;
    return k;
  end if;
  h := reserve_checkout(p_items, p_idempotency_key, '{}'::jsonb, p_notes, null);
  return pay_checkout(h.id);
end $$;

-- ───────── RLS + grants ─────────
alter table holds      enable row level security;
alter table hold_lines enable row level security;
revoke all on holds, hold_lines from anon, authenticated;
grant select on holds to authenticated;
create policy holds_own on holds for select to authenticated using (customer_id = auth.uid());

revoke execute on function
  cut_held(uuid, uuid), checkout_line_total(cuts, order_mode, int), checkout_lock(jsonb),
  checkout_problems(jsonb, uuid), checkout_receive(uuid[], jsonb),
  reserve_checkout(jsonb, uuid, jsonb, jsonb, jsonb), pay_checkout(uuid), release_hold(uuid), cut_holds(uuid[])
from public, anon, authenticated;
grant execute on function reserve_checkout(jsonb, uuid, jsonb, jsonb, jsonb), pay_checkout(uuid), release_hold(uuid)
to authenticated;
grant execute on function cut_holds(uuid[]) to anon, authenticated;
