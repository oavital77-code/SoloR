-- RPC + RLS acceptance tests for the butcher's flow (docs/BUTCHER_FLOW.md §10: T1–T5, T7–T10) and the cart over
-- items. Run by scripts/db-test.sh.
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
grant execute on function pg_temp.expect_error(text, text) to authenticated, anon;

create or replace function pg_temp.check(p_ok boolean, p_msg text) returns void
language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'ASSERTION FAILED: %', p_msg; end if;
end $$;
grant execute on function pg_temp.check(boolean, text) to authenticated, anon;

-- helper: buy one item through the cart checkout; returns that shop's order id.
-- A cart problem is re-raised with the line's own reason so single-line tests read naturally.
create or replace function pg_temp.buy(p_item uuid, p_mode text, p_g int, p_key uuid, p_note text) returns uuid
language plpgsql as $$
declare
  k checkouts;
  v_bid uuid;
begin
  select butcher_id into v_bid from items where id = p_item;
  begin
    k := place_checkout(jsonb_build_array(jsonb_build_object('item_id', p_item, 'mode', p_mode, 'requested_g', p_g)),
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
  return (select o.id from orders o join order_items i on i.order_id = o.id where o.checkout_id = k.id and i.item_id = p_item);
end $$;
grant execute on function pg_temp.buy(uuid, text, int, uuid, text) to authenticated;

-- helper: an item's label from its id, and an id from a label (as the owner, so RLS does not hide drafts)
create or replace function pg_temp.item(p_label text) returns uuid language sql security definer as $$
  select id from items where label = p_label $$;
grant execute on function pg_temp.item(text) to authenticated, anon;

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

-- ═════════ T1: recording → stop → a new parent code ═════════
set role authenticated;
set request.jwt.claim.sub = '10000000-0000-4000-8000-00000000000b';

select set_config('t.p', (select id::text from start_parent()), false);
select pg_temp.check((select code is null and status = 'recording' from parents where id = current_setting('t.p')::uuid),
                     'a new parent has no code while recording');
select pg_temp.expect_error(format('select stop_recording(%L, ''elsewhere/v.mp4'')', current_setting('t.p')), 'NOT_ALLOWED');
select stop_recording(current_setting('t.p')::uuid, '00000000-0000-4000-8000-000000000001/v/rec.mp4');
select set_config('t.code', (select code::text from parents where id = current_setting('t.p')::uuid), false);
select pg_temp.check((select code > 0 and status = 'details' and video_path like '%/rec.mp4'
                      from parents where id = current_setting('t.p')::uuid), 'T1: the code is given at stop, the video is linked');
select pg_temp.check((select code from stop_recording(current_setting('t.p')::uuid)) = current_setting('t.code')::int,
                     'a second stop keeps the code');

-- R17: one parent at a time, unless paused explicitly
select pg_temp.expect_error('select start_parent()', 'PARENT_IN_PROGRESS');
select set_config('t.p2', (select id::text from start_parent(true)), false);
select pg_temp.check((select paused_at is not null from parents where id = current_setting('t.p')::uuid), 'the first parent is paused');
select resume_parent(current_setting('t.p')::uuid);
select pg_temp.check((select paused_at is null from parents where id = current_setting('t.p')::uuid)
                 and (select paused_at is not null from parents where id = current_setting('t.p2')::uuid), 'R16: resumed, the other paused');
select discard_parent(current_setting('t.p2')::uuid);
select pg_temp.check((select count(*) from parents where id = current_setting('t.p2')::uuid) = 0, 'a recording parent can be thrown away');

-- details are the butcher's columns; status, code and stock are not
select pg_temp.expect_error(format('update parents set status = ''closed'' where id = %L', current_setting('t.p')), '42501');
select pg_temp.expect_error(format('update parents set code = 9 where id = %L', current_setting('t.p')), '42501');
select pg_temp.expect_error(format('insert into items (parent_id, butcher_id, kind, label) values (%L, ''00000000-0000-4000-8000-000000000001'', ''remainder'', ''x'')', current_setting('t.p')), '42501');
update parents set cut_type = 'entrecote', breed_key = 'black_angus', origin_country = 'AR', is_aged = true,
                   aging_days = 28, aging_method = 'dry', price_per_kg_agorot = 22000
where id = current_setting('t.p')::uuid;

-- ═════════ S3/S4: split into units; numbers are never reused (T3) ═════════
select pg_temp.expect_error(format('select new_unit(%L)', current_setting('t.p')), 'INVALID_TRANSITION');   -- not split yet
select set_split(current_setting('t.p')::uuid, true);
select set_config('t.u1', (select id::text from new_unit(current_setting('t.p')::uuid)), false);
select set_config('t.u2', (select id::text from new_unit(current_setting('t.p')::uuid)), false);
select pg_temp.check((select label from items where id = current_setting('t.u1')::uuid) = current_setting('t.code') || '-1'
                 and (select label from items where id = current_setting('t.u2')::uuid) = current_setting('t.code') || '-2',
                     'T2: units are code-1, code-2');
select cancel_unit(current_setting('t.u2')::uuid);
select set_config('t.u3', (select id::text from new_unit(current_setting('t.p')::uuid)), false);
select pg_temp.check((select label from items where id = current_setting('t.u3')::uuid) = current_setting('t.code') || '-3',
                     'T3: after cancelling -2 the next unit is -3');
select pg_temp.expect_error(format('select set_split(%L, false)', current_setting('t.p')), 'HAS_UNITS');

-- T7: no weight / no photo → cannot go live
select pg_temp.expect_error(format('select publish_item(%L)', current_setting('t.u1')), 'MISSING_FIELDS');
update items set weight_g = 1240, steak_count = 3, weight_source = 'scan' where id = current_setting('t.u1')::uuid;
do $$
declare d text;
begin
  perform publish_item(current_setting('t.u1')::uuid);
  raise exception 'should have failed';
exception when others then
  get stacked diagnostics d = pg_exception_detail;
  perform pg_temp.check(sqlerrm = 'MISSING_FIELDS' and d = 'photos', 'T7: only the photo is missing, got ' || sqlerrm || ' ' || d);
end $$;
insert into cut_media (item_id, type, storage_path, is_cover) values (current_setting('t.u1')::uuid, 'photo', 'x/y/1.jpg', true);
select publish_item(current_setting('t.u1')::uuid);
select pg_temp.check((select status = 'published' and price_per_kg_agorot = 22000 and published_at is not null
                      from items where id = current_setting('t.u1')::uuid), 'R8/R10: live, with the parent''s price');
-- R6: a live unit's weight is final
select pg_temp.expect_error(format('update items set weight_g = 1000 where id = %L', current_setting('t.u1')), 'NOT_ALLOWED');
select pg_temp.expect_error(format('insert into cut_media (item_id, type, storage_path) values (%L, ''photo'', ''x/y/2.jpg'')', current_setting('t.u1')), '42501');
select pg_temp.expect_error(format('delete from cut_media where item_id = %L', current_setting('t.u1')), 'LAST_PHOTO');
select pg_temp.expect_error(format('select cancel_unit(%L)', current_setting('t.u1')), 'INVALID_TRANSITION');

-- R11: this unit at its own price
update items set weight_g = 830, steak_count = 2, price_per_kg_agorot = 25000 where id = current_setting('t.u3')::uuid;
insert into cut_media (item_id, type, storage_path) values (current_setting('t.u3')::uuid, 'photo', 'x/y/3.jpg');
select publish_item(current_setting('t.u3')::uuid);
select pg_temp.check((select price_per_kg_agorot from items where id = current_setting('t.u3')::uuid) = 25000, 'R11: price changed for one unit');

-- S7: the remainder ("סיימתי"), one per parent; closing waits for drafts
select set_config('t.r', (select id::text from create_remainder(current_setting('t.p')::uuid)), false);
select pg_temp.check((select id from create_remainder(current_setting('t.p')::uuid)) = current_setting('t.r')::uuid, 'one remainder per parent');
select pg_temp.check((select label from items where id = current_setting('t.r')::uuid) = current_setting('t.code'), 'the remainder carries the parent code');
select pg_temp.expect_error(format('select close_parent(%L, true)', current_setting('t.p')), 'HAS_DRAFTS');
update items set weight_g = 1100, weight_source = 'manual' where id = current_setting('t.r')::uuid;
insert into cut_media (item_id, type, storage_path) values (current_setting('t.r')::uuid, 'photo', 'x/y/r.jpg');
select publish_item(current_setting('t.r')::uuid);
select pg_temp.expect_error(format('select new_unit(%L)', current_setting('t.p')), 'INVALID_TRANSITION');  -- the rest is back on the counter
select close_parent(current_setting('t.p')::uuid, false);
select pg_temp.check((select status = 'closed' and not video_published and closed_at is not null
                      from parents where id = current_setting('t.p')::uuid), 'S8: closed, video kept off the feed');
select pg_temp.expect_error(format('select discard_parent(%L)', current_setting('t.p')), 'INVALID_TRANSITION');

-- ═════════ T4: not split → only the whole cut, as a remainder ═════════
select set_config('t.w', (select id::text from start_parent()), false);
select stop_recording(current_setting('t.w')::uuid);
update parents set cut_type = 'picanha', breed_other = 'אנגוס מקומי', origin_country = 'IL', is_aged = false,
                   price_per_kg_agorot = 18000 where id = current_setting('t.w')::uuid;
select set_split(current_setting('t.w')::uuid, false);
select set_config('t.wr', (select id::text from items where parent_id = current_setting('t.w')::uuid), false);
select pg_temp.check((select count(*) = 1 and bool_and(kind = 'remainder') from items where parent_id = current_setting('t.w')::uuid),
                     'T4: one item, the remainder');
select pg_temp.expect_error(format('select new_unit(%L)', current_setting('t.w')), 'INVALID_TRANSITION');
update items set weight_g = 2400 where id = current_setting('t.wr')::uuid;
insert into cut_media (item_id, type, storage_path) values (current_setting('t.wr')::uuid, 'photo', 'x/y/w.jpg');
select publish_item(current_setting('t.wr')::uuid);
select close_parent(current_setting('t.w')::uuid);

-- ═════════ customers: one page per parent (T2, T5) ═════════
set request.jwt.claim.sub = '10000000-0000-4000-8000-0000000000c1';
select pg_temp.check((select count(*) from catalog_items where parent_id = current_setting('t.p')::uuid) = 3
                 and (select bool_and(cut_type = 'entrecote' and breed_key = 'black_angus' and aging_days = 28 and video_path is null)
                      from catalog_items where parent_id = current_setting('t.p')::uuid),
                     'T2/T5: three items on one page, all with the parent''s details, the video kept back');
select pg_temp.check((select code from catalog_items where id = current_setting('t.u1')::uuid) = 'SOL-' || current_setting('t.code') || '-1',
                     'displayed as SOL-code-1');
select pg_temp.check((select count(*) from items where status = 'draft') = 0, 'customers see no drafts');
update items set weight_g = 1 where id = current_setting('t.r')::uuid;              -- filtered out by RLS
select pg_temp.check((select weight_g from items where id = current_setting('t.r')::uuid) = 1100, 'a customer cannot change an item');
select pg_temp.expect_error('select start_parent()', 'NOT_ALLOWED');
select pg_temp.expect_error(format('select publish_item(%L)', current_setting('t.u1')), 'NOT_ALLOWED');
select pg_temp.expect_error('insert into checkouts (idempotency_key, customer_id) values (gen_random_uuid(), auth.uid())', '42501');
select pg_temp.expect_error('update profiles set role = ''butcher'' where id = auth.uid()', '42501');

-- ═════════ T8: a unit is bought whole ═════════
select set_config('t.o1', (select pg_temp.buy(current_setting('t.u1')::uuid, 'unit', null,
       '20000000-0000-4000-8000-000000000001', 'בבקשה לעטוף')::text), false);
select pg_temp.check(o.total_agorot = 27280 and i.est_weight_g = 1240 and i.mode = 'unit' and o.customer_note = 'בבקשה לעטוף',
                     'unit 1,240 g × 220 = 272.80')
from orders o join order_items i on i.order_id = o.id where o.id = current_setting('t.o1')::uuid;
select pg_temp.check((select status = 'sold_out' and sold_out_at is not null from items where id = current_setting('t.u1')::uuid), 'T8: the unit is gone');
select pg_temp.check(pg_temp.buy(current_setting('t.u1')::uuid, 'unit', null, '20000000-0000-4000-8000-000000000001', null)
                     = current_setting('t.o1')::uuid, 'idempotent');
select pg_temp.expect_error(format('select pg_temp.buy(%L, ''unit'', null, gen_random_uuid(), null)', current_setting('t.u1')), 'ITEM_NOT_AVAILABLE');
select pg_temp.expect_error(format('select pg_temp.buy(%L, ''remainder_all'', null, gen_random_uuid(), null)', current_setting('t.u3')), 'INVALID_CART');
select pg_temp.expect_error(format('select pg_temp.buy(%L, ''unit'', null, gen_random_uuid(), null)', current_setting('t.r')), 'INVALID_CART');

-- ═════════ T9: slices of the remainder, up to 95% ═════════
set request.jwt.claim.sub = '10000000-0000-4000-8000-0000000000c2';
select pg_temp.check(slice_max_g(1100) = 1045, 'R14: 95% of 1,100');
select pg_temp.expect_error(format('select pg_temp.buy(%L, ''remainder_slice'', 1100, gen_random_uuid(), null)', current_setting('t.r')), 'NOT_ENOUGH_WEIGHT');
select pg_temp.expect_error(format('select pg_temp.buy(%L, ''remainder_slice'', 150, gen_random_uuid(), null)', current_setting('t.r')), 'INVALID_QTY');
select pg_temp.expect_error(format('select pg_temp.buy(%L, ''remainder_slice'', 625, gen_random_uuid(), null)', current_setting('t.r')), 'INVALID_QTY');
do $$
declare d text;
begin
  perform place_checkout(jsonb_build_array(jsonb_build_object('item_id', current_setting('t.r'), 'mode', 'remainder_slice',
                                                              'requested_g', 1050)), gen_random_uuid(), '{}');
  raise exception 'should have failed';
exception when others then
  get stacked diagnostics d = pg_exception_detail;
  perform pg_temp.check((d::jsonb -> 0 ->> 'available_g')::int = 1000, 'the most that can be sliced, in steps: ' || d);
end $$;
select set_config('t.o2', (select pg_temp.buy(current_setting('t.r')::uuid, 'remainder_slice', 600, gen_random_uuid(), null)::text), false);
select pg_temp.check(i.total_agorot = 13200 and i.requested_g = 600 and i.est_weight_g = 600 and i.mode = 'remainder_slice',
                     'slice of 600 g = 132.00')
from order_items i where i.order_id = current_setting('t.o2')::uuid;
select pg_temp.check((select weight_g = 500 and status = 'published' from items where id = current_setting('t.r')::uuid), 'T9: 1,100 − 600 = 500 left');

-- C2 does not see C1's order; customers cannot read stock events
select pg_temp.check((select count(*) from orders where id = current_setting('t.o1')::uuid) = 0, 'C2 sees no foreign orders');
select pg_temp.check((select count(*) from stock_events) = 0, 'customers cannot read stock_events');
select pg_temp.expect_error(format('select pg_temp.buy(%L, ''unit'', null, ''20000000-0000-4000-8000-000000000001'', null)', current_setting('t.u3')), 'NOT_ALLOWED');
select pg_temp.expect_error(format('select cancel_order(%L, null)', current_setting('t.o1')), 'NOT_ALLOWED');

-- all of what is left, then a cancellation gives it back
set request.jwt.claim.sub = '10000000-0000-4000-8000-0000000000c1';
select set_config('t.o3', (select pg_temp.buy(current_setting('t.r')::uuid, 'remainder_all', null, gen_random_uuid(), null)::text), false);
select pg_temp.check((select total_agorot from orders where id = current_setting('t.o3')::uuid) = 11000, 'all of 500 g = 110.00');
select pg_temp.check((select weight_g = 0 and status = 'sold_out' from items where id = current_setting('t.r')::uuid), 'all bought → sold out');
select cancel_order(current_setting('t.o3')::uuid, null);
select pg_temp.check((select weight_g = 500 and status = 'published' and sold_out_at is null from items where id = current_setting('t.r')::uuid),
                     'cancel → the 500 g are back');
select pg_temp.expect_error(format('select cancel_order(%L, null)', current_setting('t.o3')), 'INVALID_TRANSITION');
-- a cancelled unit is back on sale; bought again (it stays an open line of shop 1 for the later tests)
select cancel_order(current_setting('t.o1')::uuid, null);
select pg_temp.check((select status = 'published' and sold_out_at is null from items where id = current_setting('t.u1')::uuid), 'cancelled unit back on sale');
select set_config('t.o1', (select pg_temp.buy(current_setting('t.u1')::uuid, 'unit', null, gen_random_uuid(), null)::text), false);

-- ═════════ butcher: parent edits, store sales (T10), order flow ═════════
set request.jwt.claim.sub = '10000000-0000-4000-8000-00000000000b';
select pg_temp.expect_error(format('update parents set price_per_kg_agorot = 25000 where id = %L', current_setting('t.p')), 'HAS_ACTIVE_ORDERS');
update parents set description = 'שיש יפה' where id = current_setting('t.p')::uuid;
select pg_temp.check((select phone from profiles where id = '10000000-0000-4000-8000-0000000000c1') = '052-2222222', 'butcher reads customer phone');

select store_sale(current_setting('t.r')::uuid, 700, false);
select pg_temp.check((select weight_g = 700 and status = 'published' from items where id = current_setting('t.r')::uuid),
                     'T10: the new balance replaces the old one (500 → 700)');
select pg_temp.expect_error(format('select store_sale(%L, -1, false)', current_setting('t.r')), 'INVALID_WEIGHT');
select store_sale(current_setting('t.u3')::uuid, null, false);
select pg_temp.check((select status from items where id = current_setting('t.u3')::uuid) = 'sold_out', 'a unit sold at the counter');
select pg_temp.expect_error(format('select store_sale(%L, null, false)', current_setting('t.u3')), 'ITEM_NOT_AVAILABLE');
select pg_temp.check((select count(*) from stock_events where item_id = current_setting('t.r')::uuid and type = 'store_sale'
                      and weight_delta_g = 200 and weight_after_g = 700) = 1, 'store sale logged');

select pg_temp.expect_error(format('select advance_order(%L, ''ready'')', current_setting('t.o2')), 'INVALID_TRANSITION');
select advance_order(current_setting('t.o2')::uuid, 'preparing');
set request.jwt.claim.sub = '10000000-0000-4000-8000-0000000000c2';
select pg_temp.expect_error(format('select cancel_order(%L, null)', current_setting('t.o2')), 'INVALID_TRANSITION');
select pg_temp.expect_error(format('select advance_order(%L, ''ready'')', current_setting('t.o2')), 'NOT_ALLOWED');
set request.jwt.claim.sub = '10000000-0000-4000-8000-00000000000b';
select pg_temp.expect_error(format('select cancel_order(%L, null)', current_setting('t.o2')), 'REASON_REQUIRED');
select cancel_order(current_setting('t.o2')::uuid, 'הנתח לא זמין');
select pg_temp.check((select weight_g from items where id = current_setting('t.r')::uuid) = 1300, 'butcher cancel returns the 600 g');
select pg_temp.check((select string_agg(coalesce(from_status::text, '-') || '>' || to_status::text, ',' order by id)
                      from order_events where order_id = current_setting('t.o2')::uuid) = '->new,new>preparing,preparing>cancelled',
                     'order_events timeline');

-- sold all at the counter; withdraw keeps it readable for the live feed
select store_sale(current_setting('t.r')::uuid, null, true);
select pg_temp.check((select weight_g = 0 and status = 'sold_out' from items where id = current_setting('t.r')::uuid), '"נמכרה כולה"');
select withdraw_item(current_setting('t.wr')::uuid);
select pg_temp.expect_error(format('select withdraw_item(%L)', current_setting('t.wr')), 'INVALID_TRANSITION');
set request.jwt.claim.sub = '10000000-0000-4000-8000-0000000000c1';
select pg_temp.check((select status from catalog_items where id = current_setting('t.wr')::uuid) = 'withdrawn', 'a withdrawn item is still readable');
select pg_temp.expect_error(format('select pg_temp.buy(%L, ''remainder_all'', null, gen_random_uuid(), null)', current_setting('t.wr')), 'ITEM_NOT_AVAILABLE');

\echo 'Butcher flow tests passed'

-- ═════════ cart across two shops, all or nothing, line cancellations ═════════
reset role;
insert into auth.users (id, email) values ('10000000-0000-4000-8000-0000000000b2', 'butcher2@test');
insert into profiles (id, full_name, phone) values ('10000000-0000-4000-8000-0000000000b2', 'קצב שני', '050-9999999');
update profiles set role = 'butcher', butcher_id = '00000000-0000-4000-8000-000000000002'
where id = '10000000-0000-4000-8000-0000000000b2';
set role authenticated;

-- shop 1: a sinta remainder of 1,500 g; shop 2: a whole asado (3,000 g) and a denver unit of 600 g
set request.jwt.claim.sub = '10000000-0000-4000-8000-00000000000b';
select set_config('t.sp', (select id::text from start_parent()), false);
select stop_recording(current_setting('t.sp')::uuid);
update parents set cut_type = 'sinta', breed_key = 'black_angus', origin_country = 'UY', is_aged = false, price_per_kg_agorot = 20000
where id = current_setting('t.sp')::uuid;
select set_split(current_setting('t.sp')::uuid, false);
select set_config('t.s1', (select id::text from items where parent_id = current_setting('t.sp')::uuid), false);
update items set weight_g = 1500 where id = current_setting('t.s1')::uuid;
insert into cut_media (item_id, type, storage_path) values (current_setting('t.s1')::uuid, 'photo', 's/1.jpg');
select publish_item(current_setting('t.s1')::uuid);
select close_parent(current_setting('t.sp')::uuid);

set request.jwt.claim.sub = '10000000-0000-4000-8000-0000000000b2';
select set_config('t.ap', (select id::text from start_parent()), false);
select stop_recording(current_setting('t.ap')::uuid);
update parents set cut_type = 'asado', breed_key = 'black_angus', origin_country = 'AR', is_aged = false, price_per_kg_agorot = 11000
where id = current_setting('t.ap')::uuid;
select set_split(current_setting('t.ap')::uuid, false);
select set_config('t.s2', (select id::text from items where parent_id = current_setting('t.ap')::uuid), false);
update items set weight_g = 3000 where id = current_setting('t.s2')::uuid;
insert into cut_media (item_id, type, storage_path) values (current_setting('t.s2')::uuid, 'photo', 's/2.jpg');
select publish_item(current_setting('t.s2')::uuid);
select close_parent(current_setting('t.ap')::uuid);

select set_config('t.dp', (select id::text from start_parent()), false);
select stop_recording(current_setting('t.dp')::uuid);
update parents set cut_type = 'denver', breed_key = 'wagyu', origin_country = 'PY', is_aged = false, price_per_kg_agorot = 17500
where id = current_setting('t.dp')::uuid;
select set_split(current_setting('t.dp')::uuid, true);
select set_config('t.s3', (select id::text from new_unit(current_setting('t.dp')::uuid)), false);
update items set weight_g = 600, steak_count = 2 where id = current_setting('t.s3')::uuid;
insert into cut_media (item_id, type, storage_path) values (current_setting('t.s3')::uuid, 'photo', 's/3.jpg');
select publish_item(current_setting('t.s3')::uuid);
select close_parent(current_setting('t.dp')::uuid);
-- another shop's parent is not mine
select pg_temp.expect_error(format('select new_unit(%L)', current_setting('t.p')), 'NOT_ALLOWED');
select pg_temp.expect_error(format('select store_sale(%L, 100, false)', current_setting('t.s1')), 'NOT_ALLOWED');

set request.jwt.claim.sub = '10000000-0000-4000-8000-0000000000c1';
select pg_temp.expect_error('select place_checkout(''[]''::jsonb, gen_random_uuid(), ''{}''::jsonb)', 'INVALID_CART');
select pg_temp.expect_error(format('select place_checkout(%L::jsonb, gen_random_uuid(), ''{}''::jsonb)',
  jsonb_build_array(jsonb_build_object('item_id', current_setting('t.s1'), 'mode', 'remainder_slice', 'requested_g', 400),
                    jsonb_build_object('item_id', current_setting('t.s1'), 'mode', 'remainder_slice', 'requested_g', 400))), 'INVALID_CART');

-- one line is short → nothing is bought, the problem is reported
do $$
declare d text;
begin
  perform place_checkout(jsonb_build_array(
    jsonb_build_object('item_id', current_setting('t.s1'), 'mode', 'remainder_slice', 'requested_g', 400),
    jsonb_build_object('item_id', current_setting('t.u3'), 'mode', 'unit')), gen_random_uuid(), '{}');
  raise exception 'should have failed';
exception when others then
  get stacked diagnostics d = pg_exception_detail;
  perform pg_temp.check(sqlerrm = 'CART_UNAVAILABLE', 'short cart → CART_UNAVAILABLE, got ' || sqlerrm);
  perform pg_temp.check((d::jsonb -> 0 ->> 'reason') = 'ITEM_NOT_AVAILABLE' and jsonb_array_length(d::jsonb) = 1, 'problem lists the sold unit: ' || d);
end $$;
select pg_temp.check((select weight_g from items where id = current_setting('t.s1')::uuid) = 1500, 'failed cart keeps stock');

-- three lines, two shops → one checkout, two orders
select set_config('t.k', (select id::text from place_checkout(jsonb_build_array(
    jsonb_build_object('item_id', current_setting('t.s1'), 'mode', 'remainder_slice', 'requested_g', 400, 'thickness_cm', 2.5),
    jsonb_build_object('item_id', current_setting('t.s2'), 'mode', 'remainder_all'),
    jsonb_build_object('item_id', current_setting('t.s3'), 'mode', 'unit')),
  '30000000-0000-4000-8000-000000000001',
  jsonb_build_object('00000000-0000-4000-8000-000000000002', 'לחתוך לאורך'))), false);
select pg_temp.check((select count(*) from orders where checkout_id = current_setting('t.k')::uuid) = 2, 'split into two shop orders');
select pg_temp.check(total_agorot = 8000 + 33000 + 10500 and checkout_number >= 5001, 'checkout total 80+330+105')
from checkouts where id = current_setting('t.k')::uuid;
select pg_temp.check(customer_note = 'לחתוך לאורך' and total_agorot = 33000 + 10500, 'shop 2 order: its lines and its note')
from orders where checkout_id = current_setting('t.k')::uuid and butcher_id = '00000000-0000-4000-8000-000000000002';
select pg_temp.check((select slice_thickness_cm = 2.5 from order_items where item_id = current_setting('t.s1')::uuid), 'thickness kept on the line');
select pg_temp.check((select weight_g from items where id = current_setting('t.s1')::uuid) = 1100
                 and (select status from items where id = current_setting('t.s2')::uuid) = 'sold_out'
                 and (select status from items where id = current_setting('t.s3')::uuid) = 'sold_out', 'stock taken for all lines');
select pg_temp.check((select id from place_checkout('[{"item_id":"00000000-0000-0000-0000-000000000000","mode":"unit"}]'::jsonb,
                      '30000000-0000-4000-8000-000000000001', '{}')) = current_setting('t.k')::uuid, 'checkout idempotent');

-- each butcher sees only their own order and its lines
set request.jwt.claim.sub = '10000000-0000-4000-8000-00000000000b';
select pg_temp.check((select count(*) from orders where checkout_id = current_setting('t.k')::uuid) = 1
                 and (select count(*) from checkouts) = 0, 'butcher 1 sees one order, no checkouts');
set request.jwt.claim.sub = '10000000-0000-4000-8000-0000000000b2';
select set_config('t.k2', (select id::text from orders where checkout_id = current_setting('t.k')::uuid), false);
select pg_temp.check((select count(*) from order_items where order_id = current_setting('t.k2')::uuid) = 2, 'butcher 2 sees both its lines');

-- customer cancels one line → the unit is back, the order stays with the asado
set request.jwt.claim.sub = '10000000-0000-4000-8000-0000000000c1';
select cancel_order_item((select id from order_items where item_id = current_setting('t.s3')::uuid), null, false);
select pg_temp.check(status = 'new' and total_agorot = 33000, 'shop 2 order keeps the asado line')
from orders where id = current_setting('t.k2')::uuid;
select pg_temp.check((select status from items where id = current_setting('t.s3')::uuid) = 'published', 'customer line cancel always restocks');

-- butcher 2: a reason is needed; without restock the asado stays off sale; the last line cancels the order
set request.jwt.claim.sub = '10000000-0000-4000-8000-0000000000b2';
select advance_order(current_setting('t.k2')::uuid, 'preparing');
select pg_temp.expect_error(format('select cancel_order_item(%L, null, false)',
  (select id from order_items where item_id = current_setting('t.s2')::uuid)), 'REASON_REQUIRED');
select cancel_order_item((select id from order_items where item_id = current_setting('t.s2')::uuid), 'הבשר לא תקין', false);
select pg_temp.check(status = 'cancelled' and cancelled_by = 'butcher', 'last line cancelled → order cancelled')
from orders where id = current_setting('t.k2')::uuid;
select pg_temp.check((select status = 'sold_out' and weight_g = 0 from items where id = current_setting('t.s2')::uuid), 'no restock: asado stays off sale');

\echo 'Cart tests passed'

-- spec examples via SQL helpers
select pg_temp.check(price_for_weight(1240, 22000) = 27280 and price_for_weight(600, 22000) = 13200, 'pricing examples');

\echo 'RPC tests passed'

-- ═════════ guests (anon): public catalogue only ═════════
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.check((select count(*) from catalog_items where status = 'draft') = 0, 'anon sees no drafts');
select pg_temp.check((select count(*) from catalog_items where status = 'published') > 0, 'anon sees live items');
select pg_temp.check((select count(*) from parents) = (select count(distinct parent_id) from catalog_items), 'anon sees only parents with something public');
select pg_temp.check((select count(*) from butchers) = 2, 'anon sees both shops');
select pg_temp.expect_error('select count(*) from profiles', '42501');
select pg_temp.expect_error('select count(*) from orders', '42501');
select pg_temp.expect_error('select count(*) from stock_events', '42501');
select pg_temp.expect_error('select place_checkout(''[]''::jsonb, gen_random_uuid(), ''{}''::jsonb)', '42501');
select pg_temp.expect_error('select start_parent()', '42501');
select pg_temp.expect_error('select count(*) from checkouts', '42501');
select pg_temp.expect_error('select count(*) from order_items', '42501');
reset role;

\echo 'Guest access tests passed'
