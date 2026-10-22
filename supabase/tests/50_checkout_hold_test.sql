-- Checkout holds (0013): reserve holds the cart without touching stock, another customer is refused while it
-- lasts, pay turns it into the purchase once, expiry / release free it, receive choices follow the shop.
\set ON_ERROR_STOP 1
create or replace function pg_temp.check(p_ok boolean, p_msg text) returns void
language plpgsql as $$ begin if not coalesce(p_ok, false) then raise exception 'ASSERTION FAILED: %', p_msg; end if; end $$;
grant execute on function pg_temp.check(boolean, text) to authenticated;
create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void
language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then if sqlerrm = p_code or sqlstate = p_code then return; end if;
    raise exception 'expected % but got %: %', p_code, sqlerrm, p_sql;
  end;
  raise exception 'expected % but statement succeeded: %', p_code, p_sql;
end $$;
grant execute on function pg_temp.expect_error(text, text) to authenticated, anon;
-- the reasons a CART_UNAVAILABLE carried
create or replace function pg_temp.reasons(p_sql text) returns text
language plpgsql as $$
declare v_detail text;
begin
  begin execute p_sql;
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    if sqlerrm <> 'CART_UNAVAILABLE' then raise exception 'expected CART_UNAVAILABLE but got %', sqlerrm; end if;
    return (select string_agg(e->>'reason', ',') from jsonb_array_elements(v_detail::jsonb) e);
  end;
  raise exception 'expected CART_UNAVAILABLE but statement succeeded: %', p_sql;
end $$;
grant execute on function pg_temp.reasons(text) to authenticated;

-- fixture: a parent sold whole (a remainder of 1,000 g at ₪500/kg) and another live remainder of shop 1
create or replace function pg_temp.remainder(p_weight int) returns uuid language plpgsql as $$
declare v_p uuid; v_i uuid;
begin
  v_p := (start_parent(true)).id;
  perform stop_recording(v_p);
  update parents set cut_type = 'sinta', breed_key = 'wagyu', origin_country = 'JP', is_aged = false, price_per_kg_agorot = 50000 where id = v_p;
  perform set_split(v_p, false);
  select id into v_i from items where parent_id = v_p;
  update items set weight_g = p_weight where id = v_i;
  insert into cut_media (item_id, type, storage_path) values (v_i, 'photo', 'p/q/h.jpg');
  perform publish_item(v_i);
  perform close_parent(v_p);
  return v_i;
end $$;
grant execute on function pg_temp.remainder(int) to authenticated;
set role authenticated;
set request.jwt.claim.sub = '10000000-0000-4000-8000-00000000000b';
select set_config('t.item', pg_temp.remainder(1000)::text, false);
select set_config('t.live', pg_temp.remainder(2000)::text, false);

create or replace function pg_temp.cart(p_mode text, p_g int) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('item_id', current_setting('t.item'), 'mode', p_mode, 'requested_g', p_g)) $$;
grant execute on function pg_temp.cart(text, int) to authenticated;

-- ── customer 1 holds a 600 g slice ──
set request.jwt.claim.sub = '10000000-0000-4000-8000-0000000000c1';
select set_config('t.h1', (select id::text from reserve_checkout(pg_temp.cart('remainder_slice', 600), gen_random_uuid())), false);
select pg_temp.check((select status = 'active' and total_agorot = 30000 and fees_agorot = 0
                        and receive->'00000000-0000-4000-8000-000000000001'->>'method' = 'pickup'
                        and contact->>'phone' ~ '^05' from holds where id = current_setting('t.h1')::uuid), 'hold with summary and pickup');
select pg_temp.check((select weight_g = 1000 and status = 'published' from items where id = current_setting('t.item')::uuid),
                     'a hold does not touch stock');
select pg_temp.check((select count(*) from item_holds(array[current_setting('t.item')::uuid])) = 0, 'own hold not reported to self');

-- ── customer 2 is refused while it lasts, and sees why ──
set request.jwt.claim.sub = '10000000-0000-4000-8000-0000000000c2';
select pg_temp.check((select held_g = 600 and not whole_held from item_holds(array[current_setting('t.item')::uuid])), 'others see 600 g held');
select pg_temp.check(pg_temp.reasons(format('select reserve_checkout(%L::jsonb, gen_random_uuid())', pg_temp.cart('remainder_all', null))) = 'ITEM_RESERVED',
                     'all of a partly held remainder → ITEM_RESERVED');
select pg_temp.check(pg_temp.reasons(format('select reserve_checkout(%L::jsonb, gen_random_uuid())', pg_temp.cart('remainder_slice', 400))) = 'NOT_ENOUGH_WEIGHT',
                     '400 g of the free 400 g is over 95%');
select pg_temp.check(pg_temp.reasons(format('select place_checkout(%L::jsonb, gen_random_uuid())', pg_temp.cart('remainder_all', null))) = 'ITEM_RESERVED',
                     'place_checkout respects holds too');
select pg_temp.check((select count(*) from holds where id = current_setting('t.h1')::uuid) = 0, 'another customer cannot read the hold');
select pg_temp.expect_error(format('select pay_checkout(%L)', current_setting('t.h1')), 'NOT_ALLOWED');

-- ── the hold runs out: customer 2 can now hold, and customer 1's late payment is refused ──
reset role;
update holds set expires_at = now() - interval '1 second' where id = current_setting('t.h1')::uuid;
set role authenticated;
set request.jwt.claim.sub = '10000000-0000-4000-8000-0000000000c2';
select set_config('t.h2', (select id::text from reserve_checkout(pg_temp.cart('remainder_slice', 400), gen_random_uuid())), false);
set request.jwt.claim.sub = '10000000-0000-4000-8000-0000000000c1';
select pg_temp.check(pg_temp.reasons(format('select pay_checkout(%L)', current_setting('t.h1'))) = 'NOT_ENOUGH_WEIGHT',
                     'late payment refused when the grams were taken meanwhile');

-- ── customer 2 goes back: released, so customer 1 can hold again; a new attempt replaces the old one ──
set request.jwt.claim.sub = '10000000-0000-4000-8000-0000000000c2';
select release_hold(current_setting('t.h2')::uuid);
set request.jwt.claim.sub = '10000000-0000-4000-8000-0000000000c1';
select set_config('t.key', gen_random_uuid()::text, false);
select set_config('t.h3', (select id::text from reserve_checkout(pg_temp.cart('remainder_all', null), current_setting('t.key')::uuid)), false);
select pg_temp.check((select id::text from reserve_checkout(pg_temp.cart('remainder_all', null), current_setting('t.key')::uuid)) = current_setting('t.h3'),
                     'same key → same hold');
select pg_temp.check((select status from holds where id = current_setting('t.h1')::uuid) = 'released', 'older attempt released');
select pg_temp.check((select total_agorot from holds where id = current_setting('t.h3')::uuid) = 50000, 'all of 1,000 g = 500.00');

-- ── the remainder was weighed again at the counter since the summary: refused ──
set request.jwt.claim.sub = '10000000-0000-4000-8000-00000000000b';
select store_sale(current_setting('t.item')::uuid, 900, false);
set request.jwt.claim.sub = '10000000-0000-4000-8000-0000000000c1';
select pg_temp.expect_error(format('select pay_checkout(%L)', current_setting('t.h3')), 'PRICE_CHANGED');
select release_hold(current_setting('t.h3')::uuid);
select pg_temp.expect_error(format('select pay_checkout(%L)', current_setting('t.h3')), 'HOLD_RELEASED');

-- ── pay: once, with the receive choice on the order ──
select set_config('t.h4', (select id::text from reserve_checkout(pg_temp.cart('remainder_slice', 600), gen_random_uuid(), '{}',
  jsonb_build_object('00000000-0000-4000-8000-000000000001', 'לעטוף בנפרד'),
  '{"name": "דנה לוי", "phone": "052-1234567"}')), false);
select set_config('t.k', (select id::text from pay_checkout(current_setting('t.h4')::uuid)), false);
select pg_temp.check((select id::text from pay_checkout(current_setting('t.h4')::uuid)) = current_setting('t.k'), 'paying twice → one purchase');
select pg_temp.check((select contact_name = 'דנה לוי' and contact_phone = '052-1234567' and is_demo and total_agorot = 30000
                      from checkouts where id = current_setting('t.k')::uuid), 'checkout has contact, demo flag, total');
select pg_temp.check((select count(*) = 1 and bool_and(receive_method = 'pickup' and delivery_address is null and customer_note = 'לעטוף בנפרד')
                      from orders where checkout_id = current_setting('t.k')::uuid), 'one pickup order with the note');
select pg_temp.check((select status from holds where id = current_setting('t.h4')::uuid) = 'consumed', 'hold consumed');
reset role;
select pg_temp.check((select weight_g = 300 and status = 'published' from items where id = current_setting('t.item')::uuid), 'stock moved on payment: 900 − 600');
select pg_temp.check((select count(*) from order_items where item_id = current_setting('t.item')::uuid) = 1, 'one order line');
set role authenticated;

-- ── contact and receive checks ──
set request.jwt.claim.sub = '10000000-0000-4000-8000-0000000000c2';
create or replace function pg_temp.live() returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('item_id', current_setting('t.live'), 'mode', 'remainder_slice', 'requested_g', 200)) $$;
grant execute on function pg_temp.live() to authenticated, anon;
select pg_temp.expect_error(format('select reserve_checkout(%L::jsonb, gen_random_uuid(), ''{}'', ''{}'', ''{"name":"ד","phone":"123"}'')', pg_temp.live()), 'INVALID_CONTACT');
create or replace function pg_temp.delivery(p_city text, p_window text) returns jsonb language sql as $$
  select jsonb_build_object('00000000-0000-4000-8000-000000000001', jsonb_build_object('method', 'delivery', 'window', p_window,
    'address', jsonb_build_object('name', 'סבתא רחל', 'phone', '054-7654321', 'street', 'הרצל 5', 'city', p_city))) $$;
grant execute on function pg_temp.delivery(text, text) to authenticated;
-- delivery is off in the pilot: refused
select pg_temp.expect_error(format('select reserve_checkout(%L::jsonb, gen_random_uuid(), %L::jsonb)', pg_temp.live(), pg_temp.delivery('חיפה', null)),
                            'RECEIVE_NOT_AVAILABLE');
reset role;
update butchers set delivery_enabled = true, delivery_areas = '{תל אביב,רמת גן}', delivery_pricing = '{"רמת גן": 3500, "*": 2500}',
                    delivery_windows = '{ה׳ 16:00–20:00}'
where id = '00000000-0000-4000-8000-000000000001';
set role authenticated;
set request.jwt.claim.sub = '10000000-0000-4000-8000-0000000000c2';
select pg_temp.expect_error(format('select reserve_checkout(%L::jsonb, gen_random_uuid(), %L::jsonb)', pg_temp.live(), pg_temp.delivery('חיפה', null)),
                            'DELIVERY_NOT_ELIGIBLE');
select pg_temp.expect_error(format('select reserve_checkout(%L::jsonb, gen_random_uuid(), %L::jsonb)', pg_temp.live(), pg_temp.delivery('רמת גן', 'מחר')),
                            'INVALID_WINDOW');
select set_config('t.h5', (select id::text from reserve_checkout(pg_temp.live(), gen_random_uuid(), pg_temp.delivery(' רמת גן ', null))), false);
select pg_temp.check((select fees_agorot = 3500 and total_agorot = items_agorot + 3500 from holds where id = current_setting('t.h5')::uuid),
                     'delivery fee by destination');
select set_config('t.k5', (select id::text from pay_checkout(current_setting('t.h5')::uuid)), false);
select pg_temp.check((select receive_method = 'delivery' and delivery_window is null and delivery_fee_agorot = 3500
                        and delivery_address->>'city' = 'רמת גן' and delivery_address->>'name' = 'סבתא רחל'
                      from orders where checkout_id = current_setting('t.k5')::uuid), 'delivery order: someone else''s address, waiting to coordinate');
select pg_temp.check((select total_agorot from checkouts where id = current_setting('t.k5')::uuid)
                     = (select total_agorot + delivery_fee_agorot from orders where checkout_id = current_setting('t.k5')::uuid), 'checkout total includes the fee');
-- pickup still works for the same shop when both are on
select pg_temp.check((select receive->'00000000-0000-4000-8000-000000000001'->>'method' from reserve_checkout(pg_temp.live(), gen_random_uuid(),
  '{"00000000-0000-4000-8000-000000000001": {"method": "pickup"}}')) = 'pickup', 'pickup chosen explicitly');
reset role;
update butchers set delivery_enabled = false, delivery_areas = '{}', delivery_pricing = '{}', delivery_windows = '{}'
where id = '00000000-0000-4000-8000-000000000001';

-- ── guests and butchers cannot hold ──
set role anon;
select pg_temp.expect_error(format('select reserve_checkout(%L::jsonb, gen_random_uuid())', pg_temp.live()), '42501');
set role authenticated;
set request.jwt.claim.sub = '10000000-0000-4000-8000-00000000000b';
select pg_temp.expect_error(format('select reserve_checkout(%L::jsonb, gen_random_uuid())', pg_temp.live()), 'NOT_ALLOWED');
reset role;
\echo 'Checkout hold tests passed'
