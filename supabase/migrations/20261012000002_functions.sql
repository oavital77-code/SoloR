-- SoloR prototype — business logic (SPEC §6, §7.4)
-- All stock mutations go through these SECURITY DEFINER functions.
-- Errors are raised with a stable code in MESSAGE (and extra data in DETAIL); the UI maps codes to Hebrew.

-- ───────────────────────── helpers ─────────────────────────

create or replace function current_role_of_user() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function current_butcher_id() returns uuid
language sql stable security definer set search_path = public as $$
  select butcher_id from profiles where id = auth.uid() and role = 'butcher'
$$;

-- price helpers — identical to src/lib/pricing.ts (integer rounding, half up)
create or replace function price_for_weight(p_weight_g int, p_price_per_kg_agorot int) returns int
language sql immutable set search_path = public as $$
  select ((p_weight_g::bigint * p_price_per_kg_agorot + 500) / 1000)::int
$$;

create or replace function max_steaks(p_weight_g int, p_steak_weight_g int) returns int
language sql immutable set search_path = public as $$
  select case when p_weight_g is null or p_steak_weight_g is null or p_steak_weight_g = 0 then 0
              else p_weight_g / p_steak_weight_g end
$$;

create or replace function cut_has_active_orders(p_cut_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from orders where cut_id = p_cut_id and status in ('new','preparing','ready'))
$$;

-- list of missing required fields for publishing (empty array = ready)
create or replace function cut_missing_fields(c cuts) returns text[]
language plpgsql stable security definer set search_path = public as $$
declare
  missing text[] := '{}';
begin
  if not exists (select 1 from cut_media m where m.cut_id = c.id and m.type = 'photo') then
    missing := array_append(missing, 'photos');
  end if;
  if c.cut_type is null then missing := array_append(missing, 'cut_type'); end if;
  if c.breed_key is null and nullif(trim(coalesce(c.breed_other, '')), '') is null then
    missing := array_append(missing, 'breed');
  end if;
  if c.origin_country is null then missing := array_append(missing, 'origin_country'); end if;
  if c.is_aged is null then missing := array_append(missing, 'is_aged'); end if;
  if c.is_aged and c.aging_days is null then missing := array_append(missing, 'aging_days'); end if;
  if c.weight_g is null then missing := array_append(missing, 'weight_g'); end if;
  if c.price_per_kg_agorot is null then missing := array_append(missing, 'price_per_kg'); end if;
  if c.sale_mode is null then missing := array_append(missing, 'sale_mode'); end if;
  if c.sale_mode in ('steaks','both') then
    if c.steak_weight_g is null then
      missing := array_append(missing, 'steak_weight_g');
    elsif max_steaks(c.weight_g, c.steak_weight_g) < 1 then
      missing := array_append(missing, 'steaks_count');
    end if;
  end if;
  return missing;
end $$;

-- computes the stock columns of a cut from its content (used by publish and by edits of a live cut)
create or replace function compute_stock(c cuts, out steaks_total int, out whole_available boolean)
language plpgsql immutable set search_path = public as $$
declare
  mx int;
begin
  if c.sale_mode in ('steaks','both') then
    mx := max_steaks(c.weight_g, c.steak_weight_g);
    steaks_total := least(coalesce(c.steaks_planned, mx), mx);
  else
    steaks_total := 0;
  end if;
  whole_available := c.sale_mode in ('whole','both');
end $$;

-- ───────────────────────── content-edit guard (trigger) ─────────────────────────
-- Direct UPDATEs from the client can only touch content columns (column grants, see RLS migration).
-- This trigger enforces SPEC §6.5 for cuts that are not drafts:
--   * description / butcher_marbling: always allowed
--   * anything else: only when there are no active orders (HAS_ACTIVE_ORDERS)
--   * fields that change stock: only while nothing was sold yet (STOCK_CHANGED); stock is recomputed
--   * required fields cannot be emptied (MISSING_FIELDS)
-- RPCs set the GUC solor.rpc = 'on' so their own updates bypass this guard.

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

  -- identity / ownership columns are never editable
  if new.id <> old.id or new.code <> old.code or new.butcher_id <> old.butcher_id then
    raise exception 'NOT_ALLOWED';
  end if;

  -- withdrawn cuts are frozen
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
    -- only while the cut is untouched: published, nothing sold (orders of any status or store sales)
    if old.status <> 'published'
       or exists (select 1 from orders o where o.cut_id = old.id and o.status <> 'cancelled')
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

create trigger cuts_guard_update before update on cuts
  for each row execute function cuts_guard_update();

-- Keep at least one photo on a cut that is not a draft
create or replace function cut_media_guard_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.type = 'photo'
     and exists (select 1 from cuts c where c.id = old.cut_id and c.status in ('published','sold_out'))
     and not exists (select 1 from cut_media m where m.cut_id = old.cut_id and m.type = 'photo' and m.id <> old.id)
  then
    raise exception 'LAST_PHOTO';
  end if;
  return old;
end $$;

create trigger cut_media_guard_delete before delete on cut_media
  for each row execute function cut_media_guard_delete();

-- ───────────────────────── RPCs ─────────────────────────

-- publish_cut: draft → published
create or replace function publish_cut(p_cut_id uuid) returns cuts
language plpgsql security definer set search_path = public as $$
declare
  v_bid uuid := current_butcher_id();
  c cuts;
  missing text[];
  st record;
begin
  if v_bid is null then raise exception 'NOT_ALLOWED'; end if;
  select * into c from cuts where id = p_cut_id for update;
  if not found or c.butcher_id <> v_bid then raise exception 'NOT_ALLOWED'; end if;
  if c.status <> 'draft' then raise exception 'INVALID_TRANSITION'; end if;

  missing := cut_missing_fields(c);
  if array_length(missing, 1) > 0 then
    raise exception 'MISSING_FIELDS' using detail = array_to_string(missing, ',');
  end if;

  st := compute_stock(c);
  perform set_config('solor.rpc', 'on', true);
  update cuts set
    status           = 'published',
    published_at     = now(),
    sold_out_at      = null,
    steaks_total     = st.steaks_total,
    steaks_available = st.steaks_total,
    whole_available  = st.whole_available
  where id = p_cut_id
  returning * into c;
  perform set_config('solor.rpc', 'off', true);

  insert into stock_events (cut_id, type, steaks_delta, whole_after, actor_id)
  values (c.id, 'publish', c.steaks_total, c.whole_available, auth.uid());

  return c;
end $$;

-- revert_to_draft: published → draft, only when the cut never had orders or store sales
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
  if exists (select 1 from orders where cut_id = c.id) then raise exception 'HAS_ACTIVE_ORDERS'; end if;
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

-- place_order: atomic stock check + decrement (SPEC §6.4)
create or replace function place_order(
  p_cut_id uuid,
  p_mode order_mode,
  p_steaks_qty int,
  p_idempotency_key uuid,
  p_note text default null
) returns orders
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  c cuts;
  o orders;
  v_qty int;
  v_weight int;
  v_total int;
  v_delta int;
begin
  if v_uid is null or current_role_of_user() is distinct from 'customer' then
    raise exception 'NOT_ALLOWED';
  end if;
  if p_idempotency_key is null then raise exception 'INVALID_QTY'; end if;
  if p_note is not null and char_length(p_note) > 300 then raise exception 'NOTE_TOO_LONG'; end if;

  -- idempotency (fast path)
  select * into o from orders where idempotency_key = p_idempotency_key;
  if found then
    if o.customer_id <> v_uid then raise exception 'NOT_ALLOWED'; end if;
    return o;
  end if;

  -- lock the cut: concurrent orders on the same cut are serialized here
  select * into c from cuts where id = p_cut_id for update;
  if not found then raise exception 'CUT_NOT_AVAILABLE'; end if;

  -- idempotency (after waiting on the lock, a parallel duplicate may have committed)
  select * into o from orders where idempotency_key = p_idempotency_key;
  if found then
    if o.customer_id <> v_uid then raise exception 'NOT_ALLOWED'; end if;
    return o;
  end if;

  if c.status not in ('published','sold_out') then raise exception 'CUT_NOT_AVAILABLE'; end if;

  if p_mode = 'whole' then
    if c.status = 'sold_out' then raise exception 'CUT_NOT_AVAILABLE'; end if;
    if c.sale_mode not in ('whole','both') then raise exception 'WHOLE_NOT_AVAILABLE'; end if;
    if not c.whole_available or c.steaks_available <> c.steaks_total then
      raise exception 'WHOLE_NOT_AVAILABLE';
    end if;
    v_qty    := null;
    v_weight := c.weight_g;
    v_total  := price_for_weight(c.weight_g, c.price_per_kg_agorot);
    v_delta  := -c.steaks_available;
  else
    if c.sale_mode not in ('steaks','both') then raise exception 'CUT_NOT_AVAILABLE'; end if;
    v_qty := p_steaks_qty;
    if v_qty is null or v_qty < 1 then raise exception 'INVALID_QTY'; end if;
    if v_qty > c.steaks_available then
      raise exception 'NOT_ENOUGH_STEAKS' using detail = c.steaks_available::text;
    end if;
    v_weight := c.steak_weight_g * v_qty;
    v_total  := price_for_weight(c.steak_weight_g, c.price_per_kg_agorot) * v_qty;
    v_delta  := -v_qty;
  end if;

  insert into orders (idempotency_key, customer_id, butcher_id, cut_id, mode, steaks_qty,
                      est_weight_g, price_per_kg_agorot, total_agorot, customer_note)
  values (p_idempotency_key, v_uid, c.butcher_id, c.id, p_mode, v_qty,
          v_weight, c.price_per_kg_agorot, v_total, nullif(trim(p_note), ''))
  returning * into o;

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

  insert into order_events (order_id, from_status, to_status, actor_id)
  values (o.id, null, 'new', v_uid);

  return o;
end $$;

-- cancel_order: customer (own, status new) or butcher (own shop, before completed). Restores stock.
create or replace function cancel_order(p_order_id uuid, p_reason text default null) returns orders
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role user_role := current_role_of_user();
  v_bid uuid := current_butcher_id();
  o orders;
  c cuts;
  v_delta int;
  v_whole boolean;
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
    if nullif(trim(coalesce(p_reason, '')), '') is null then raise exception 'REASON_REQUIRED'; end if;
  end if;

  select * into c from cuts where id = o.cut_id for update;

  if o.mode = 'whole' then
    v_delta := c.steaks_total - c.steaks_available;
  else
    v_delta := least(o.steaks_qty, c.steaks_total - c.steaks_available);
  end if;

  v_from := o.status;
  update orders set status = 'cancelled', cancel_reason = nullif(trim(p_reason), ''), cancelled_by = v_role
  where id = o.id returning * into o;

  insert into order_events (order_id, from_status, to_status, actor_id, note)
  values (o.id, v_from, 'cancelled', v_uid, nullif(trim(p_reason), ''));

  -- return stock only for cuts that are still on sale (a withdrawn cut stays withdrawn)
  if c.status in ('published','sold_out') then
    v_whole := c.sale_mode in ('whole','both') and (c.steaks_available + v_delta) = c.steaks_total
               and not exists (select 1 from stock_events s where s.cut_id = c.id and s.type = 'store_sale')
               and not exists (select 1 from orders x where x.cut_id = c.id and x.id <> o.id and x.status <> 'cancelled');
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
    values (c.id, 'order_cancel', v_delta, c.whole_available, o.id, v_uid, nullif(trim(p_reason), ''));
  end if;

  return o;
end $$;

-- advance_order: butcher moves new → preparing → ready → completed
create or replace function advance_order(p_order_id uuid, p_to_status order_status) returns orders
language plpgsql security definer set search_path = public as $$
declare
  v_bid uuid := current_butcher_id();
  o orders;
  v_from order_status;
begin
  if v_bid is null then raise exception 'NOT_ALLOWED'; end if;
  select * into o from orders where id = p_order_id for update;
  if not found or o.butcher_id <> v_bid then raise exception 'NOT_ALLOWED'; end if;

  v_from := o.status;
  if not ((v_from = 'new' and p_to_status = 'preparing')
       or (v_from = 'preparing' and p_to_status = 'ready')
       or (v_from = 'ready' and p_to_status = 'completed')) then
    raise exception 'INVALID_TRANSITION';
  end if;

  update orders set status = p_to_status where id = o.id returning * into o;
  insert into order_events (order_id, from_status, to_status, actor_id)
  values (o.id, v_from, p_to_status, auth.uid());
  return o;
end $$;

-- store_sale: manual stock update for in-store sales (SPEC §6.4.4)
create or replace function store_sale(p_cut_id uuid, p_steaks_qty int, p_sell_all boolean) returns cuts
language plpgsql security definer set search_path = public as $$
declare
  v_bid uuid := current_butcher_id();
  c cuts;
  v_delta int;
begin
  if v_bid is null then raise exception 'NOT_ALLOWED'; end if;
  select * into c from cuts where id = p_cut_id for update;
  if not found or c.butcher_id <> v_bid then raise exception 'NOT_ALLOWED'; end if;
  if c.status <> 'published' then raise exception 'CUT_NOT_AVAILABLE'; end if;

  if coalesce(p_sell_all, false) then
    v_delta := -c.steaks_available;
    perform set_config('solor.rpc', 'on', true);
    update cuts set steaks_available = 0, whole_available = false,
                    status = 'sold_out', sold_out_at = now()
    where id = c.id returning * into c;
    perform set_config('solor.rpc', 'off', true);
  else
    if c.sale_mode not in ('steaks','both') then raise exception 'INVALID_QTY'; end if;
    if p_steaks_qty is null or p_steaks_qty < 1 then raise exception 'INVALID_QTY'; end if;
    if p_steaks_qty > c.steaks_available then
      raise exception 'NOT_ENOUGH_STEAKS' using detail = c.steaks_available::text;
    end if;
    v_delta := -p_steaks_qty;
    perform set_config('solor.rpc', 'on', true);
    update cuts set
      steaks_available = steaks_available + v_delta,
      whole_available  = false,
      status           = case when steaks_available + v_delta = 0 then 'sold_out'::cut_status else status end,
      sold_out_at      = case when steaks_available + v_delta = 0 then now() else sold_out_at end
    where id = c.id returning * into c;
    perform set_config('solor.rpc', 'off', true);
  end if;

  insert into stock_events (cut_id, type, steaks_delta, whole_after, actor_id, reason)
  values (c.id, 'store_sale', v_delta, c.whole_available, auth.uid(),
          case when coalesce(p_sell_all, false) then 'sell_all' else null end);
  return c;
end $$;

-- withdraw_cut: published / sold_out → withdrawn
create or replace function withdraw_cut(p_cut_id uuid) returns cuts
language plpgsql security definer set search_path = public as $$
declare
  v_bid uuid := current_butcher_id();
  c cuts;
  v_delta int;
begin
  if v_bid is null then raise exception 'NOT_ALLOWED'; end if;
  select * into c from cuts where id = p_cut_id for update;
  if not found or c.butcher_id <> v_bid then raise exception 'NOT_ALLOWED'; end if;
  if c.status not in ('published','sold_out') then raise exception 'INVALID_TRANSITION'; end if;
  if cut_has_active_orders(c.id) then raise exception 'HAS_ACTIVE_ORDERS'; end if;

  v_delta := -c.steaks_available;
  perform set_config('solor.rpc', 'on', true);
  update cuts set status = 'withdrawn', steaks_available = 0, whole_available = false
  where id = c.id returning * into c;
  perform set_config('solor.rpc', 'off', true);

  insert into stock_events (cut_id, type, steaks_delta, whole_after, actor_id)
  values (c.id, 'withdraw', v_delta, false, auth.uid());
  return c;
end $$;
