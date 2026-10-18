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

-- fixture: a fresh published cut with 2 steaks of the first shop
set role authenticated;
set request.jwt.claim.sub = '10000000-0000-4000-8000-00000000000b';
insert into cuts (butcher_id, cut_type, breed_key, origin_country, is_aged, weight_g, price_per_kg_agorot, sale_mode, steak_weight_g, steaks_planned)
values ('00000000-0000-4000-8000-000000000001', 'sinta', 'wagyu', 'JP', false, 600, 50000, 'both', 300, 2);
reset role;
select set_config('t.cut', (select id::text from cuts order by created_at desc, code desc limit 1), false);
insert into cut_media (cut_id, type, storage_path) values (current_setting('t.cut')::uuid, 'photo', 'p/q/h.jpg');
set role authenticated;
set request.jwt.claim.sub = '10000000-0000-4000-8000-00000000000b';
select publish_cut(current_setting('t.cut')::uuid);

create or replace function pg_temp.cart(p_mode text, p_qty int) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('cut_id', current_setting('t.cut'), 'mode', p_mode, 'steaks_qty', p_qty)) $$;
grant execute on function pg_temp.cart(text, int) to authenticated;

-- ── customer 1 holds both steaks ──
set request.jwt.claim.sub = '10000000-0000-4000-8000-0000000000c1';
select set_config('t.h1', (select id::text from reserve_checkout(pg_temp.cart('steaks', 2), gen_random_uuid())), false);
select pg_temp.check((select status = 'active' and total_agorot = 30000 and fees_agorot = 0
                        and receive->'00000000-0000-4000-8000-000000000001'->>'method' = 'pickup'
                        and contact->>'phone' ~ '^05' from holds where id = current_setting('t.h1')::uuid), 'hold with summary and pickup');
select pg_temp.check((select steaks_available = 2 and status = 'published' from cuts where id = current_setting('t.cut')::uuid),
                     'a hold does not touch stock');
select pg_temp.check((select count(*) from cut_holds(array[current_setting('t.cut')::uuid])) = 0, 'own hold not reported to self');

-- ── customer 2 is refused while it lasts, and sees why ──
set request.jwt.claim.sub = '10000000-0000-4000-8000-0000000000c2';
select pg_temp.check((select steaks_held = 2 from cut_holds(array[current_setting('t.cut')::uuid])), 'others see the cut held');
select pg_temp.check(pg_temp.reasons(format('select reserve_checkout(%L::jsonb, gen_random_uuid())', pg_temp.cart('steaks', 1))) = 'CUT_RESERVED',
                     'held cut → CUT_RESERVED');
select pg_temp.check(pg_temp.reasons(format('select place_checkout(%L::jsonb, gen_random_uuid())', pg_temp.cart('steaks', 1))) = 'CUT_RESERVED',
                     'place_checkout respects holds too');
select pg_temp.check((select count(*) from holds where id = current_setting('t.h1')::uuid) = 0, 'another customer cannot read the hold');
select pg_temp.expect_error(format('select pay_checkout(%L)', current_setting('t.h1')), 'NOT_ALLOWED');

-- ── the hold runs out: customer 2 can now hold, and customer 1's late payment is refused ──
reset role;
update holds set expires_at = now() - interval '1 second' where id = current_setting('t.h1')::uuid;
set role authenticated;
set request.jwt.claim.sub = '10000000-0000-4000-8000-0000000000c2';
select set_config('t.h2', (select id::text from reserve_checkout(pg_temp.cart('steaks', 1), gen_random_uuid())), false);
set request.jwt.claim.sub = '10000000-0000-4000-8000-0000000000c1';
select pg_temp.check(pg_temp.reasons(format('select pay_checkout(%L)', current_setting('t.h1'))) = 'NOT_ENOUGH_STEAKS',
                     'late payment refused when the cut was taken meanwhile');

-- ── customer 2 goes back: released, so customer 1 can hold again; a new attempt replaces the old one ──
set request.jwt.claim.sub = '10000000-0000-4000-8000-0000000000c2';
select release_hold(current_setting('t.h2')::uuid);
set request.jwt.claim.sub = '10000000-0000-4000-8000-0000000000c1';
select set_config('t.key', gen_random_uuid()::text, false);
select set_config('t.h3', (select id::text from reserve_checkout(pg_temp.cart('steaks', 2), current_setting('t.key')::uuid)), false);
select pg_temp.check((select id::text from reserve_checkout(pg_temp.cart('steaks', 2), current_setting('t.key')::uuid)) = current_setting('t.h3'),
                     'same key → same hold');
select pg_temp.check((select status from holds where id = current_setting('t.h1')::uuid) = 'released', 'older attempt released');

-- ── a price change since the summary is refused ──
set request.jwt.claim.sub = '10000000-0000-4000-8000-00000000000b';
update cuts set price_per_kg_agorot = 52000 where id = current_setting('t.cut')::uuid;
set request.jwt.claim.sub = '10000000-0000-4000-8000-0000000000c1';
select pg_temp.expect_error(format('select pay_checkout(%L)', current_setting('t.h3')), 'PRICE_CHANGED');
select release_hold(current_setting('t.h3')::uuid);
select pg_temp.expect_error(format('select pay_checkout(%L)', current_setting('t.h3')), 'HOLD_RELEASED');

-- ── pay: once, with the receive choice on the order ──
select set_config('t.h4', (select id::text from reserve_checkout(pg_temp.cart('steaks', 2), gen_random_uuid(), '{}',
  jsonb_build_object('00000000-0000-4000-8000-000000000001', 'לעטוף בנפרד'),
  '{"name": "דנה לוי", "phone": "052-1234567"}')), false);
select set_config('t.k', (select id::text from pay_checkout(current_setting('t.h4')::uuid)), false);
select pg_temp.check((select id::text from pay_checkout(current_setting('t.h4')::uuid)) = current_setting('t.k'), 'paying twice → one purchase');
select pg_temp.check((select contact_name = 'דנה לוי' and contact_phone = '052-1234567' and is_demo and total_agorot = 31200
                      from checkouts where id = current_setting('t.k')::uuid), 'checkout has contact, demo flag, total');
select pg_temp.check((select count(*) = 1 and bool_and(receive_method = 'pickup' and delivery_address is null and customer_note = 'לעטוף בנפרד')
                      from orders where checkout_id = current_setting('t.k')::uuid), 'one pickup order with the note');
select pg_temp.check((select status from holds where id = current_setting('t.h4')::uuid) = 'consumed', 'hold consumed');
reset role;
select pg_temp.check((select steaks_available = 0 and status = 'sold_out' from cuts where id = current_setting('t.cut')::uuid), 'stock moved on payment');
select pg_temp.check((select count(*) from order_items where cut_id = current_setting('t.cut')::uuid) = 1, 'one order line');
set role authenticated;

-- ── contact and receive checks ──
set request.jwt.claim.sub = '10000000-0000-4000-8000-0000000000c2';
select set_config('t.live', (select id::text from cuts where status = 'published' and butcher_id = '00000000-0000-4000-8000-000000000001'
  and sale_mode in ('steaks','both') and steaks_available > 0 limit 1), false);
create or replace function pg_temp.live() returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('cut_id', current_setting('t.live'), 'mode', 'steaks', 'steaks_qty', 1)) $$;
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
