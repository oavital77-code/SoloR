-- RPC + RLS acceptance tests (SPEC §13 stage 5/6). Run by scripts/db-test.sh.
\set ON_ERROR_STOP 1

-- helper: run a statement and assert it fails with the given message (code)
create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm = p_code or sqlstate = p_code then
      return;
    end if;
    raise exception 'expected % but got % (%): %', p_code, sqlstate, sqlerrm, p_sql;
  end;
  raise exception 'expected % but statement succeeded: %', p_code, p_sql;
end $$;
grant execute on function pg_temp.expect_error(text, text) to authenticated;

create or replace function pg_temp.check(p_ok boolean, p_msg text) returns void
language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'ASSERTION FAILED: %', p_msg; end if;
end $$;
grant execute on function pg_temp.check(boolean, text) to authenticated;

-- helper: buy one cut through the cart checkout; returns that shop's order id.
-- A cart problem is re-raised with the line's own reason so single-line tests read naturally.
create or replace function pg_temp.buy(p_cut uuid, p_mode text, p_qty int, p_key uuid, p_note text) returns uuid
language plpgsql as $$
declare
  k checkouts;
  v_bid uuid;
begin
  select butcher_id into v_bid from cuts where id = p_cut;
  begin
    k := place_checkout(jsonb_build_array(jsonb_build_object('cut_id', p_cut, 'mode', p_mode, 'steaks_qty', p_qty)),
                        p_key, case when p_note is null then '{}'::jsonb else jsonb_build_object(v_bid::text, p_note) end);
  exception when others then
    if sqlerrm = 'CART_UNAVAILABLE' then
      declare d text; begin
        get stacked diagnostics d = pg_exception_detail;
        raise exception '%', (d::jsonb -> 0 ->> 'reason');
      end;
    end if;
    raise;
  end;
  return (select o.id from orders o join order_items i on i.order_id = o.id where o.checkout_id = k.id and i.cut_id = p_cut);
end $$;
grant execute on function pg_temp.buy(uuid, text, int, uuid, text) to authenticated;

-- fixtures (as superuser)
insert into auth.users (id, email) values
  ('10000000-0000-4000-8000-00000000000b', 'butcher@test'),
  ('10000000-0000-4000-8000-0000000000c1', 'c1@test'),
  ('10000000-0000-4000-8000-0000000000c2', 'c2@test');
insert into profiles (id, full_name, phone) values
  ('10000000-0000-4000-8000-00000000000b', 'הקצב', '050-1111111'),
  ('10000000-0000-4000-8000-0000000000c1', 'לקוח אחד', '052-2222222'),
  ('10000000-0000-4000-8000-0000000000c2', 'לקוח שתיים', '054-3333333');
update profiles set role = 'butcher', butcher_id = '00000000-0000-4000-8000-000000000001'
where id = '10000000-0000-4000-8000-00000000000b';

-- ═════════ butcher creates a draft ═════════
set role authenticated;
set request.jwt.claim.sub = '10000000-0000-4000-8000-00000000000b';

insert into cuts (butcher_id) values ('00000000-0000-4000-8000-000000000001');
select set_config('test.cut', (select id::text from cuts order by created_at desc limit 1), false);

select pg_temp.check((select code from cuts where id = current_setting('test.cut')::uuid) = 'SOL-0001', 'first code is SOL-0001');

-- butcher can't write stock or status directly
select pg_temp.expect_error(format('update cuts set steaks_available = 99 where id = %L', current_setting('test.cut')), '42501');
select pg_temp.expect_error(format('update cuts set status = ''published'' where id = %L', current_setting('test.cut')), '42501');

-- publish with nothing → MISSING_FIELDS
select pg_temp.expect_error(format('select publish_cut(%L)', current_setting('test.cut')), 'MISSING_FIELDS');

update cuts set cut_type = 'entrecote', breed_key = 'black_angus', origin_country = 'AR',
                is_aged = true, aging_days = 28, aging_method = 'dry',
                weight_g = 2400, price_per_kg_agorot = 22000, sale_mode = 'both', steak_weight_g = 300
where id = current_setting('test.cut')::uuid;

-- still missing a photo
do $$ begin
  perform publish_cut(current_setting('test.cut')::uuid);
  raise exception 'should have failed';
exception when others then
  perform pg_temp.check(sqlerrm = 'MISSING_FIELDS', 'missing photo → MISSING_FIELDS, got ' || sqlerrm);
end $$;

insert into cut_media (cut_id, type, storage_path, is_cover)
values (current_setting('test.cut')::uuid, 'photo', 'x/y/1.jpg', true);

select publish_cut(current_setting('test.cut')::uuid);
select pg_temp.check(steaks_total = 8 and steaks_available = 8 and whole_available and status = 'published',
                     'published: 8 steaks, whole available')
from cuts where id = current_setting('test.cut')::uuid;

-- ═════════ customer side ═════════
set request.jwt.claim.sub = '10000000-0000-4000-8000-0000000000c1';

-- direct stock write from customer is blocked (acceptance §13 stage 5)
select pg_temp.expect_error(format('update cuts set steaks_available = 99 where id = %L', current_setting('test.cut')), '42501');
select pg_temp.expect_error('insert into checkouts (idempotency_key, customer_id) values (gen_random_uuid(), auth.uid())', '42501');
select pg_temp.expect_error('insert into order_items (order_id, cut_id, mode, est_weight_g, price_per_kg_agorot, total_agorot) select id, current_setting(''test.cut'')::uuid, ''whole'', 1, 1, 1 from orders limit 1', '42501');
-- customer cannot change own role
select pg_temp.expect_error('update profiles set role = ''butcher'' where id = auth.uid()', '42501');
-- customer cannot publish
select pg_temp.expect_error(format('select publish_cut(%L)', current_setting('test.cut')), 'NOT_ALLOWED');

-- order 3 steaks: 3 × 66.00 = 198.00
select set_config('test.o1', (select pg_temp.buy(current_setting('test.cut')::uuid, 'steaks', 3,
       '20000000-0000-4000-8000-000000000001', 'בבקשה לעטוף')::text), false);
select pg_temp.check(o.total_agorot = 19800 and i.est_weight_g = 900 and i.price_per_kg_agorot = 22000 and o.status = 'new'
                     and o.customer_note = 'בבקשה לעטוף',
                     'order 3 steaks = 198.00')
from orders o join order_items i on i.order_id = o.id where o.id = current_setting('test.o1')::uuid;
select pg_temp.check(steaks_available = 5 and not whole_available and status = 'published', '5 left, whole closed')
from cuts where id = current_setting('test.cut')::uuid;

-- idempotency: same key → same order, no new stock change
select pg_temp.check(pg_temp.buy(current_setting('test.cut')::uuid, 'steaks', 3,
       '20000000-0000-4000-8000-000000000001', null) = current_setting('test.o1')::uuid, 'idempotent order');
select pg_temp.check((select steaks_available from cuts where id = current_setting('test.cut')::uuid) = 5, 'idempotency keeps stock');

select pg_temp.expect_error(format('select pg_temp.buy(%L, ''whole'', null, gen_random_uuid(), null)', current_setting('test.cut')), 'WHOLE_NOT_AVAILABLE');
select pg_temp.expect_error(format('select pg_temp.buy(%L, ''steaks'', 6, gen_random_uuid(), null)', current_setting('test.cut')), 'NOT_ENOUGH_STEAKS');
select pg_temp.expect_error(format('select pg_temp.buy(%L, ''steaks'', 0, gen_random_uuid(), null)', current_setting('test.cut')), 'INVALID_QTY');

-- C2 does not see C1's order
set request.jwt.claim.sub = '10000000-0000-4000-8000-0000000000c2';
select pg_temp.check((select count(*) from orders) = 0, 'C2 sees no foreign orders');
select pg_temp.check((select count(*) from stock_events) = 0, 'customers cannot read stock_events');
-- someone else's idempotency key cannot be replayed
select pg_temp.expect_error(format('select pg_temp.buy(%L, ''steaks'', 1, ''20000000-0000-4000-8000-000000000001'', null)', current_setting('test.cut')), 'NOT_ALLOWED');
-- C2 cannot cancel C1's order
select pg_temp.expect_error(format('select cancel_order(%L, null)', current_setting('test.o1')), 'NOT_ALLOWED');

-- ═════════ butcher: edits with active order ═════════
set request.jwt.claim.sub = '10000000-0000-4000-8000-00000000000b';
select pg_temp.expect_error(format('update cuts set price_per_kg_agorot = 25000 where id = %L', current_setting('test.cut')), 'HAS_ACTIVE_ORDERS');
update cuts set description = 'שיש יפה', butcher_marbling = 8 where id = current_setting('test.cut')::uuid;
select pg_temp.expect_error(format('select withdraw_cut(%L)', current_setting('test.cut')), 'HAS_ACTIVE_ORDERS');
-- delete of a published cut is filtered by RLS (0 rows) — verify the row survived
delete from cuts where id = current_setting('test.cut')::uuid;
reset role;
select pg_temp.check(exists (select 1 from cuts where id = current_setting('test.cut')::uuid), 'published cut cannot be deleted');
set role authenticated;
-- butcher can read the customer's name/phone
select pg_temp.check((select phone from profiles where id = '10000000-0000-4000-8000-0000000000c1') = '052-2222222', 'butcher reads customer phone');

-- ═════════ customer cancels → stock back, whole reopens ═════════
set request.jwt.claim.sub = '10000000-0000-4000-8000-0000000000c1';
select cancel_order(current_setting('test.o1')::uuid, null);
select pg_temp.check(steaks_available = 8 and whole_available and status = 'published', 'cancel restores 8 + whole')
from cuts where id = current_setting('test.cut')::uuid;
select pg_temp.expect_error(format('select cancel_order(%L, null)', current_setting('test.o1')), 'INVALID_TRANSITION');

-- ═════════ store sale of 2 steaks ═════════
set request.jwt.claim.sub = '10000000-0000-4000-8000-00000000000b';
select store_sale(current_setting('test.cut')::uuid, 2, false);
select pg_temp.check(steaks_available = 6 and not whole_available, 'store sale: 6 left, whole closed')
from cuts where id = current_setting('test.cut')::uuid;
select pg_temp.check((select count(*) from stock_events where cut_id = current_setting('test.cut')::uuid
                      and type = 'store_sale' and steaks_delta = -2) = 1, 'store_sale logged');
-- stock-affecting edit after a sale → STOCK_CHANGED
select pg_temp.expect_error(format('update cuts set steak_weight_g = 400 where id = %L', current_setting('test.cut')), 'STOCK_CHANGED');
-- price edit without active orders is fine
update cuts set price_per_kg_agorot = 23000 where id = current_setting('test.cut')::uuid;
-- emptying a required field on a live cut is blocked
select pg_temp.expect_error(format('update cuts set origin_country = null where id = %L', current_setting('test.cut')), 'MISSING_FIELDS');

-- ═════════ customer buys all 6 → sold_out; status flow; butcher cancel ═════════
set request.jwt.claim.sub = '10000000-0000-4000-8000-0000000000c2';
select set_config('test.o2', (select pg_temp.buy(current_setting('test.cut')::uuid, 'steaks', 6,
       gen_random_uuid(), null)::text), false);
select pg_temp.check(status = 'sold_out' and steaks_available = 0 and sold_out_at is not null, 'sold out')
from cuts where id = current_setting('test.cut')::uuid;
select pg_temp.check((select total_agorot from orders where id = current_setting('test.o2')::uuid) = 6 * 6900, 'price uses new price 230/kg');
select pg_temp.expect_error(format('select pg_temp.buy(%L, ''steaks'', 1, gen_random_uuid(), null)', current_setting('test.cut')), 'NOT_ENOUGH_STEAKS');
select pg_temp.expect_error(format('select pg_temp.buy(%L, ''whole'', null, gen_random_uuid(), null)', current_setting('test.cut')), 'CUT_NOT_AVAILABLE');

set request.jwt.claim.sub = '10000000-0000-4000-8000-00000000000b';
select pg_temp.expect_error(format('select advance_order(%L, ''ready'')', current_setting('test.o2')), 'INVALID_TRANSITION');
select advance_order(current_setting('test.o2')::uuid, 'preparing');

set request.jwt.claim.sub = '10000000-0000-4000-8000-0000000000c2';
select pg_temp.expect_error(format('select cancel_order(%L, null)', current_setting('test.o2')), 'INVALID_TRANSITION');
select pg_temp.expect_error(format('select advance_order(%L, ''ready'')', current_setting('test.o2')), 'NOT_ALLOWED');

set request.jwt.claim.sub = '10000000-0000-4000-8000-00000000000b';
select pg_temp.expect_error(format('select cancel_order(%L, null)', current_setting('test.o2')), 'REASON_REQUIRED');
select cancel_order(current_setting('test.o2')::uuid, 'הנתח לא זמין');
select pg_temp.check(status = 'published' and steaks_available = 6 and not whole_available and sold_out_at is null,
                     'butcher cancel restores 6, whole stays closed (store sale happened)')
from cuts where id = current_setting('test.cut')::uuid;
select pg_temp.check((select string_agg(coalesce(from_status::text, '-') || '>' || to_status::text, ',' order by id)
                      from order_events where order_id = current_setting('test.o2')::uuid) = '->new,new>preparing,preparing>cancelled',
                     'order_events timeline');
select pg_temp.check((select cancelled_by from orders where id = current_setting('test.o2')::uuid) = 'butcher', 'cancelled_by butcher');

-- ═════════ full status flow + withdraw ═════════
set request.jwt.claim.sub = '10000000-0000-4000-8000-0000000000c1';
select set_config('test.o3', (select pg_temp.buy(current_setting('test.cut')::uuid, 'steaks', 2,
       gen_random_uuid(), null)::text), false);
set request.jwt.claim.sub = '10000000-0000-4000-8000-00000000000b';
select advance_order(current_setting('test.o3')::uuid, 'preparing');
select advance_order(current_setting('test.o3')::uuid, 'ready');
select pg_temp.expect_error(format('select withdraw_cut(%L)', current_setting('test.cut')), 'HAS_ACTIVE_ORDERS');
select advance_order(current_setting('test.o3')::uuid, 'completed');
select pg_temp.expect_error(format('select cancel_order(%L, ''x'')', current_setting('test.o3')), 'INVALID_TRANSITION');
select withdraw_cut(current_setting('test.cut')::uuid);
select pg_temp.check(status = 'withdrawn' and steaks_available = 0, 'withdrawn')
from cuts where id = current_setting('test.cut')::uuid;
select pg_temp.expect_error(format('update cuts set description = ''x'' where id = %L', current_setting('test.cut')), 'NOT_ALLOWED');

-- ═════════ whole-only cut: whole purchase, cancel ═════════
insert into cuts (butcher_id, cut_type, breed_other, origin_country, is_aged, weight_g, price_per_kg_agorot, sale_mode)
values ('00000000-0000-4000-8000-000000000001', 'picanha', 'אנגוס מקומי', 'IL', false, 1500, 18000, 'whole');
select set_config('test.cut2', (select id::text from cuts where cut_type = 'picanha'), false);
insert into cut_media (cut_id, type, storage_path) values (current_setting('test.cut2')::uuid, 'photo', 'a/b/c.jpg');
select publish_cut(current_setting('test.cut2')::uuid);
-- cannot delete the last photo of a live cut
select pg_temp.expect_error(format('delete from cut_media where cut_id = %L', current_setting('test.cut2')), 'LAST_PHOTO');

set request.jwt.claim.sub = '10000000-0000-4000-8000-0000000000c1';
select pg_temp.expect_error(format('select pg_temp.buy(%L, ''steaks'', 1, gen_random_uuid(), null)', current_setting('test.cut2')), 'CUT_NOT_AVAILABLE');
select set_config('test.o4', (select pg_temp.buy(current_setting('test.cut2')::uuid, 'whole', null,
       gen_random_uuid(), null)::text), false);
select pg_temp.check(o.total_agorot = 27000 and i.est_weight_g = 1500, 'whole price 270.00')
from orders o join order_items i on i.order_id = o.id where o.id = current_setting('test.o4')::uuid;
select pg_temp.check(status = 'sold_out' and not whole_available, 'whole → sold_out') from cuts where id = current_setting('test.cut2')::uuid;
select cancel_order(current_setting('test.o4')::uuid, null);
select pg_temp.check(status = 'published' and whole_available, 'cancel whole → back on sale') from cuts where id = current_setting('test.cut2')::uuid;

-- ═════════ drafts: delete + revert ═════════
set request.jwt.claim.sub = '10000000-0000-4000-8000-00000000000b';
insert into cuts (butcher_id) values ('00000000-0000-4000-8000-000000000001');
delete from cuts where status = 'draft';
reset role;
select pg_temp.check((select count(*) from cuts where status = 'draft') = 0, 'draft deleted');

-- spec example (§6.3) via SQL helpers
select pg_temp.check(price_for_weight(2400, 22000) = 52800 and price_for_weight(300, 22000) = 6600
                     and max_steaks(2400, 300) = 8, 'pricing example');


-- ═════════ stage 2: cart across two shops, all or nothing, line cancellations ═════════
reset role;
insert into auth.users (id, email) values ('10000000-0000-4000-8000-0000000000b2', 'butcher2@test');
insert into profiles (id, full_name, phone) values ('10000000-0000-4000-8000-0000000000b2', 'קצב שני', '050-9999999');
update profiles set role = 'butcher', butcher_id = '00000000-0000-4000-8000-000000000002'
where id = '10000000-0000-4000-8000-0000000000b2';
set role authenticated;

-- shop 1: 6 steaks of 250 g (sinta); shop 2: a whole asado and 4 steaks of 300 g (denver)
set request.jwt.claim.sub = '10000000-0000-4000-8000-00000000000b';
insert into cuts (butcher_id, cut_type, breed_key, origin_country, is_aged, weight_g, price_per_kg_agorot, sale_mode, steak_weight_g)
values ('00000000-0000-4000-8000-000000000001', 'sinta', 'black_angus', 'UY', false, 1500, 20000, 'steaks', 250);
select set_config('test.s1', (select id::text from cuts where cut_type = 'sinta' and butcher_id = '00000000-0000-4000-8000-000000000001'), false);
insert into cut_media (cut_id, type, storage_path) values (current_setting('test.s1')::uuid, 'photo', 's/1.jpg');
select publish_cut(current_setting('test.s1')::uuid);

set request.jwt.claim.sub = '10000000-0000-4000-8000-0000000000b2';
insert into cuts (butcher_id, cut_type, breed_key, origin_country, is_aged, weight_g, price_per_kg_agorot, sale_mode)
values ('00000000-0000-4000-8000-000000000002', 'asado', 'black_angus', 'AR', false, 3000, 11000, 'whole');
insert into cuts (butcher_id, cut_type, breed_key, origin_country, is_aged, weight_g, price_per_kg_agorot, sale_mode, steak_weight_g)
values ('00000000-0000-4000-8000-000000000002', 'denver', 'wagyu', 'PY', false, 1200, 17500, 'steaks', 300);
select set_config('test.s2', (select id::text from cuts where cut_type = 'asado'), false);
select set_config('test.s3', (select id::text from cuts where cut_type = 'denver'), false);
insert into cut_media (cut_id, type, storage_path) values (current_setting('test.s2')::uuid, 'photo', 's/2.jpg'),
                                                         (current_setting('test.s3')::uuid, 'photo', 's/3.jpg');
select publish_cut(current_setting('test.s2')::uuid);
select publish_cut(current_setting('test.s3')::uuid);

set request.jwt.claim.sub = '10000000-0000-4000-8000-0000000000c1';
-- empty / duplicate carts are rejected
select pg_temp.expect_error('select place_checkout(''[]''::jsonb, gen_random_uuid(), ''{}''::jsonb)', 'INVALID_CART');
select pg_temp.expect_error(format('select place_checkout(%L::jsonb, gen_random_uuid(), ''{}''::jsonb)',
  jsonb_build_array(jsonb_build_object('cut_id', current_setting('test.s1'), 'mode', 'steaks', 'steaks_qty', 1),
                    jsonb_build_object('cut_id', current_setting('test.s1'), 'mode', 'steaks', 'steaks_qty', 1))), 'INVALID_CART');

-- one line is short → nothing is bought, every problem is reported
do $$
declare d text;
begin
  perform place_checkout(jsonb_build_array(
    jsonb_build_object('cut_id', current_setting('test.s1'), 'mode', 'steaks', 'steaks_qty', 2),
    jsonb_build_object('cut_id', current_setting('test.s3'), 'mode', 'steaks', 'steaks_qty', 9)), gen_random_uuid(), '{}');
  raise exception 'should have failed';
exception when others then
  get stacked diagnostics d = pg_exception_detail;
  perform pg_temp.check(sqlerrm = 'CART_UNAVAILABLE', 'short cart → CART_UNAVAILABLE, got ' || sqlerrm);
  perform pg_temp.check((d::jsonb -> 0 ->> 'reason') = 'NOT_ENOUGH_STEAKS' and (d::jsonb -> 0 ->> 'available')::int = 4
                        and jsonb_array_length(d::jsonb) = 1, 'problem lists the short line: ' || d);
end $$;
select pg_temp.check((select steaks_available from cuts where id = current_setting('test.s1')::uuid) = 6, 'failed cart keeps stock');
select pg_temp.check((select count(*) from order_items where cut_id in (current_setting('test.s1')::uuid, current_setting('test.s3')::uuid)) = 0, 'failed cart creates nothing');

-- three lines, two shops → one checkout, two orders
select set_config('test.k', (select id::text from place_checkout(jsonb_build_array(
    jsonb_build_object('cut_id', current_setting('test.s1'), 'mode', 'steaks', 'steaks_qty', 2),
    jsonb_build_object('cut_id', current_setting('test.s2'), 'mode', 'whole'),
    jsonb_build_object('cut_id', current_setting('test.s3'), 'mode', 'steaks', 'steaks_qty', 3)),
  '30000000-0000-4000-8000-000000000001',
  jsonb_build_object('00000000-0000-4000-8000-000000000002', 'לחתוך לאורך'))), false);
select pg_temp.check((select count(*) from orders where checkout_id = current_setting('test.k')::uuid) = 2, 'split into two shop orders');
select pg_temp.check(total_agorot = 2 * 5000 + 33000 + 3 * 5250 and checkout_number >= 5001, 'checkout total 100+330+157.50')
from checkouts where id = current_setting('test.k')::uuid;
select pg_temp.check(customer_note = 'לחתוך לאורך' and total_agorot = 33000 + 15750, 'shop 2 order: its lines and its note')
from orders where checkout_id = current_setting('test.k')::uuid and butcher_id = '00000000-0000-4000-8000-000000000002';
select pg_temp.check(customer_note is null and total_agorot = 10000, 'shop 1 order: no note')
from orders where checkout_id = current_setting('test.k')::uuid and butcher_id = '00000000-0000-4000-8000-000000000001';
select pg_temp.check((select steaks_available from cuts where id = current_setting('test.s1')::uuid) = 4
                 and (select status from cuts where id = current_setting('test.s2')::uuid) = 'sold_out'
                 and (select steaks_available from cuts where id = current_setting('test.s3')::uuid) = 1, 'stock taken for all lines');
-- same key again → same checkout, no new stock change
select pg_temp.check((select id from place_checkout('[{"cut_id":"00000000-0000-0000-0000-000000000000","mode":"whole"}]'::jsonb,
                      '30000000-0000-4000-8000-000000000001', '{}')) = current_setting('test.k')::uuid, 'checkout idempotent');

-- each butcher sees only their own order and its lines
set request.jwt.claim.sub = '10000000-0000-4000-8000-00000000000b';
select pg_temp.check((select count(*) from orders where checkout_id = current_setting('test.k')::uuid) = 1
                 and (select count(*) from order_items i join orders o on o.id = i.order_id where o.checkout_id = current_setting('test.k')::uuid) = 1
                 and (select count(*) from checkouts) = 0, 'butcher 1 sees one order, one line, no checkouts');
set request.jwt.claim.sub = '10000000-0000-4000-8000-0000000000b2';
select set_config('test.k2', (select id::text from orders where checkout_id = current_setting('test.k')::uuid), false);
select pg_temp.check((select count(*) from order_items where order_id = current_setting('test.k2')::uuid) = 2, 'butcher 2 sees both its lines');
-- another customer sees nothing
set request.jwt.claim.sub = '10000000-0000-4000-8000-0000000000c2';
select pg_temp.check((select count(*) from checkouts where id = current_setting('test.k')::uuid) = 0 and (select count(*) from order_items i join orders o on o.id = i.order_id
                      where o.checkout_id = current_setting('test.k')::uuid) = 0, 'C2 sees no foreign checkout');

-- customer cancels one line while the order is new → stock back, order total recomputed, order stays
set request.jwt.claim.sub = '10000000-0000-4000-8000-0000000000c1';
select cancel_order_item((select id from order_items where cut_id = current_setting('test.s3')::uuid), null, false);
select pg_temp.check(status = 'new' and total_agorot = 33000, 'shop 2 order keeps the asado line')
from orders where id = current_setting('test.k2')::uuid;
select pg_temp.check((select steaks_available from cuts where id = current_setting('test.s3')::uuid) = 4, 'customer line cancel always restocks');
select pg_temp.expect_error(format('select cancel_order_item(%L, null, true)',
  (select id from order_items where cut_id = current_setting('test.s3')::uuid)), 'INVALID_TRANSITION');

-- butcher 2: line cancel needs a reason; without restock the asado stays off sale; last line cancels the order
set request.jwt.claim.sub = '10000000-0000-4000-8000-0000000000b2';
select advance_order(current_setting('test.k2')::uuid, 'preparing');
select pg_temp.expect_error(format('select cancel_order_item(%L, null, false)',
  (select id from order_items where cut_id = current_setting('test.s2')::uuid)), 'REASON_REQUIRED');
select cancel_order_item((select id from order_items where cut_id = current_setting('test.s2')::uuid), 'הבשר לא תקין', false);
select pg_temp.check(status = 'cancelled' and cancelled_by = 'butcher', 'last line cancelled → order cancelled')
from orders where id = current_setting('test.k2')::uuid;
select pg_temp.check(status = 'sold_out' and not whole_available, 'no restock: asado stays off sale')
from cuts where id = current_setting('test.s2')::uuid;
select pg_temp.check((select restocked = false and cancel_reason = 'הבשר לא תקין' from order_items where cut_id = current_setting('test.s2')::uuid),
                     'line keeps reason, no restock');

-- the customer can no longer cancel the shop 1 order once it is being prepared
set request.jwt.claim.sub = '10000000-0000-4000-8000-00000000000b';
select advance_order((select id from orders where checkout_id = current_setting('test.k')::uuid), 'preparing');
set request.jwt.claim.sub = '10000000-0000-4000-8000-0000000000c1';
select pg_temp.expect_error(format('select cancel_order_item(%L, null, true)',
  (select id from order_items where cut_id = current_setting('test.s1')::uuid)), 'INVALID_TRANSITION');

-- a cut with an active line cannot be withdrawn; sold lines block stock edits
set request.jwt.claim.sub = '10000000-0000-4000-8000-00000000000b';
select pg_temp.expect_error(format('select withdraw_cut(%L)', current_setting('test.s1')), 'HAS_ACTIVE_ORDERS');
select pg_temp.expect_error(format('select revert_to_draft(%L)', current_setting('test.s1')), 'HAS_ACTIVE_ORDERS');

\echo 'Cart tests passed'

\echo 'RPC tests passed'

-- ═════════ guests (anon): public catalogue only ═════════
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.check((select count(*) from cuts where status = 'draft') = 0, 'anon sees no drafts');
select pg_temp.check((select count(*) from cuts where status = 'published') > 0, 'anon sees published cuts');
select pg_temp.check((select count(*) from butchers) = 2, 'anon sees both shops');
select pg_temp.expect_error('select count(*) from profiles', '42501');
select pg_temp.expect_error('select count(*) from orders', '42501');
select pg_temp.expect_error('select count(*) from stock_events', '42501');
select pg_temp.expect_error('select place_checkout(''[]''::jsonb, gen_random_uuid(), ''{}''::jsonb)', '42501');
select pg_temp.expect_error('select count(*) from checkouts', '42501');
select pg_temp.expect_error('select count(*) from order_items', '42501');
reset role;

\echo 'Guest access tests passed'
