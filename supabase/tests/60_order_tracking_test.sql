-- Order tracking (0014): the butcher records the supplied weight (refund by the ±5% rule) and a photo of the
-- prepared order; only the order's own shop can, and only while it is open.
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

-- an open order line of shop 1 (from the earlier tests)
select set_config('t.item', (select i.id::text from order_items i join orders o on o.id = i.order_id
  where o.butcher_id = '00000000-0000-4000-8000-000000000001' and o.status in ('new','preparing','ready') and i.status = 'active'
  order by i.created_at desc limit 1), false);
select set_config('t.order', (select order_id::text from order_items where id = current_setting('t.item')::uuid), false);
select set_config('t.est', (select est_weight_g::text from order_items where id = current_setting('t.item')::uuid), false);
select set_config('t.ppk', (select price_per_kg_agorot::text from order_items where id = current_setting('t.item')::uuid), false);
select pg_temp.check(current_setting('t.item') <> '', 'fixture: an open line');

-- the rule itself
select pg_temp.check(weight_refund(1000, 950, 20000) = 0, 'exactly -5% → nothing');
select pg_temp.check(weight_refund(1000, 949, 20000) = 1020, 'under -5% → the whole missing weight');
select pg_temp.check(weight_refund(1000, 1200, 20000) = 0, 'over → never charged or refunded');

set role authenticated;
-- the customer and another shop cannot record
set request.jwt.claim.sub = '10000000-0000-4000-8000-0000000000c1';
select pg_temp.expect_error(format('select record_item_weight(%L, 500)', current_setting('t.item')), 'NOT_ALLOWED');
select pg_temp.expect_error(format('select set_ready_photo(%L, null)', current_setting('t.order')), 'NOT_ALLOWED');
set request.jwt.claim.sub = '10000000-0000-4000-8000-0000000000b2';
select pg_temp.expect_error(format('select record_item_weight(%L, 500)', current_setting('t.item')), 'NOT_ALLOWED');

-- the shop records weights: within the tolerance nothing, under it a pending refund, over it nothing
set request.jwt.claim.sub = '10000000-0000-4000-8000-00000000000b';
select pg_temp.expect_error(format('select record_item_weight(%L, 0)', current_setting('t.item')), 'INVALID_WEIGHT');
select pg_temp.check((select refund_agorot is null and refund_status is null
  from record_item_weight(current_setting('t.item')::uuid, (current_setting('t.est')::int * 96) / 100)), 'within 5%: no refund');
select pg_temp.check((select refund_agorot = price_for_weight(current_setting('t.est')::int - (current_setting('t.est')::int * 90) / 100, current_setting('t.ppk')::int)
                        and refund_status = 'pending'
  from record_item_weight(current_setting('t.item')::uuid, (current_setting('t.est')::int * 90) / 100)), 'under 5%: whole missing weight, pending');
select pg_temp.check((select refund_agorot is null and delivered_weight_g = current_setting('t.est')::int + 300
  from record_item_weight(current_setting('t.item')::uuid, current_setting('t.est')::int + 300)), 'over: recorded, no refund');
select record_item_weight(current_setting('t.item')::uuid, (current_setting('t.est')::int * 90) / 100);

-- the photo must live in the shop's folder for this order
select pg_temp.expect_error(format('select set_ready_photo(%L, ''elsewhere/x.jpg'')', current_setting('t.order')), 'NOT_ALLOWED');
select pg_temp.check((select ready_photo_path is not null from set_ready_photo(current_setting('t.order')::uuid,
  '00000000-0000-4000-8000-000000000001/orders/' || current_setting('t.order') || '/ready.jpg')), 'photo set');

-- the customer sees both
select set_config('request.jwt.claim.sub', (select customer_id::text from orders where id = current_setting('t.order')::uuid), false);
select pg_temp.check((select ready_photo_path is not null from orders where id = current_setting('t.order')::uuid), 'customer sees the photo');
select pg_temp.check((select refund_status = 'pending' from order_items where id = current_setting('t.item')::uuid), 'customer sees the refund');
reset role;
\echo 'Order tracking tests passed'
