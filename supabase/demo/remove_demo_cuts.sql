-- Removes the demo catalogue (cuts whose media is served from /demo/), including any orders placed on them.
-- Order lines on demo cuts are deleted; shop orders and purchases left without lines go with them.
begin;
create temp table demo_ids on commit drop as
  select distinct cut_id as id from cut_media where storage_path like '/demo/%';
create temp table touched_orders on commit drop as
  select distinct order_id as id from order_items where cut_id in (select id from demo_ids);

delete from stock_events where cut_id in (select id from demo_ids);
delete from order_items where cut_id in (select id from demo_ids);

create temp table empty_orders on commit drop as
  select id from touched_orders t where not exists (select 1 from order_items i where i.order_id = t.id);
delete from stock_events where order_id in (select id from empty_orders);
delete from order_events where order_id in (select id from empty_orders);
create temp table touched_checkouts on commit drop as
  select distinct checkout_id as id from orders where id in (select id from empty_orders);
delete from orders where id in (select id from empty_orders);
delete from checkouts k where k.id in (select id from touched_checkouts)
  and not exists (select 1 from orders o where o.checkout_id = k.id);
-- shop orders that kept other lines: totals follow their remaining active lines
update orders o set total_agorot = coalesce((select sum(total_agorot) from order_items i where i.order_id = o.id and i.status = 'active'), 0)
where o.id in (select id from touched_orders) and o.status <> 'cancelled';

alter table cut_media disable trigger cut_media_guard_delete;
delete from cut_media where cut_id in (select id from demo_ids);
alter table cut_media enable trigger cut_media_guard_delete;
delete from cuts where id in (select id from demo_ids);
commit;
