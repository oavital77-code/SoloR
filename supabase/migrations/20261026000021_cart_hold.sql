-- The cart is held from the first cut put in it (founders 26.10.2026): the ten minutes start when a signed-in
-- customer adds the first cut, other customers see it as "שוריין" meanwhile, and the checkout keeps the same clock.
--
-- A cart hold is an ordinary hold (0013) with no checkout yet, one per customer and device (notes.cart_device: the
-- shared demo account is used on many phones at once). hold_cart replaces it with the cart as it is now — the lines
-- someone else holds or that are gone are left out and reported — and keeps its expiry while it is still running;
-- once it has run out, the next change (or "שריין שוב") starts a new ten minutes. An empty cart releases it.
-- Replaced holds are released (kept for the record), as checkout already does.

create or replace function hold_cart(p_items jsonb, p_device uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  h holds;
  i items;
  p profiles;
  it jsonb;
  v_problems jsonb;
  v_bad uuid[];
  v_ok jsonb;
  v_exp timestamptz;
  v_total int := 0;
begin
  if v_uid is null or current_role_of_user() is distinct from 'customer' then raise exception 'NOT_ALLOWED'; end if;
  if p_device is null then raise exception 'INVALID_CART'; end if;

  select * into h from holds
  where customer_id = v_uid and status = 'active' and checkout_id is null and notes->>'cart_device' = p_device::text
  order by created_at desc limit 1 for update;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    if h.id is not null then update holds set status = 'released', released_at = now() where id = h.id; end if;
    return jsonb_build_object('expires_at', null, 'problems', '[]'::jsonb);
  end if;

  perform checkout_lock(p_items);
  v_problems := checkout_problems(p_items, h.id);
  select coalesce(array_agg((e->>'item_id')::uuid), '{}') into v_bad from jsonb_array_elements(v_problems) e;
  select coalesce(jsonb_agg(e), '[]'::jsonb) into v_ok from jsonb_array_elements(p_items) e
  where not ((e->>'item_id')::uuid = any(v_bad));

  v_exp := case when h.id is not null and h.expires_at > now() then h.expires_at
                else now() + make_interval(mins => checkout_hold_minutes()) end;
  if h.id is not null then update holds set status = 'released', released_at = now() where id = h.id; end if;
  if jsonb_array_length(v_ok) = 0 then
    return jsonb_build_object('expires_at', null, 'problems', v_problems);
  end if;

  for it in select * from jsonb_array_elements(v_ok) loop
    select * into i from items where id = (it->>'item_id')::uuid;
    v_total := v_total + line_total(i, (it->>'mode')::line_mode, nullif(it->>'requested_g', '')::int);
  end loop;
  select * into p from profiles where id = v_uid;

  insert into holds (idempotency_key, customer_id, items, receive, notes, contact, items_agorot, fees_agorot, total_agorot, expires_at)
  values (gen_random_uuid(), v_uid, v_ok, '{}'::jsonb, jsonb_build_object('cart_device', p_device::text),
          jsonb_build_object('name', coalesce(p.full_name, ''), 'phone', coalesce(p.phone, '')), v_total, 0, v_total, v_exp)
  returning * into h;

  insert into hold_lines (hold_id, item_id, mode, requested_g)
  select h.id, (e->>'item_id')::uuid, (e->>'mode')::line_mode,
         case when e->>'mode' = 'remainder_slice' then (e->>'requested_g')::int end
  from jsonb_array_elements(v_ok) e;

  return jsonb_build_object('expires_at', h.expires_at, 'problems', v_problems);
end $$;

revoke all on function hold_cart(jsonb, uuid) from public;
grant execute on function hold_cart(jsonb, uuid) to authenticated;

-- reserve_checkout (as in 0016): check stock and hold the whole cart, all or nothing; now on the cart's clock
create or replace function reserve_checkout(p_items jsonb, p_idempotency_key uuid, p_receive jsonb default '{}'::jsonb,
                                            p_notes jsonb default '{}'::jsonb, p_contact jsonb default null)
returns holds
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  h holds;
  p profiles;
  i items;
  it jsonb;
  v_ids uuid[];
  v_bids uuid[];
  v_problems jsonb;
  v_receive jsonb;
  v_contact jsonb;
  v_items int := 0;
  v_fees int := 0;
  v_carry timestamptz;
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

  select * into h from holds where idempotency_key = p_idempotency_key;
  if found then
    if h.customer_id <> v_uid then raise exception 'NOT_ALLOWED'; end if;
    return h;
  end if;
  if exists (select 1 from checkouts where idempotency_key = p_idempotency_key) then raise exception 'NOT_ALLOWED'; end if;

  -- the clock started when the cart was first filled keeps running (0021); at least two minutes to pay
  select min(expires_at) into v_carry from holds
  where customer_id = v_uid and status = 'active' and checkout_id is null and expires_at > now();
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

  select array_agg(distinct butcher_id) into v_bids from items where id = any(v_ids);
  v_receive := checkout_receive(v_bids, p_receive);

  for it in select * from jsonb_array_elements(p_items) loop
    select * into i from items where id = (it->>'item_id')::uuid;
    v_items := v_items + line_total(i, (it->>'mode')::line_mode, nullif(it->>'requested_g', '')::int);
  end loop;
  select coalesce(sum((value->>'fee_agorot')::int), 0) into v_fees from jsonb_each(v_receive);

  insert into holds (idempotency_key, customer_id, items, receive, notes, contact, items_agorot, fees_agorot, total_agorot, expires_at)
  values (p_idempotency_key, v_uid, p_items, v_receive, coalesce(p_notes, '{}'), v_contact, v_items, v_fees, v_items + v_fees,
          coalesce(greatest(v_carry, now() + interval '2 minutes'), now() + make_interval(mins => checkout_hold_minutes())))
  returning * into h;

  insert into hold_lines (hold_id, item_id, mode, requested_g)
  select h.id, (e->>'item_id')::uuid, (e->>'mode')::line_mode,
         case when e->>'mode' = 'remainder_slice' then (e->>'requested_g')::int end
  from jsonb_array_elements(p_items) e;

  return h;
end $$;

