-- Removes the demo counter (parents whose items show media from /demo/), including any orders placed on them.
-- Order lines on demo items are deleted; shop orders and purchases left without lines go with them.
begin;
create temp table demo_parents on commit drop as
  select distinct i.parent_id as id from cut_media m join items i on i.id = m.item_id where m.storage_path like '/demo/%'
  union select id from parents where video_path like '/demo/%';
create temp table demo_ids on commit drop as select id from items where parent_id in (select id from demo_parents);
create temp table touched_orders on commit drop as
  select distinct order_id as id from order_items where item_id in (select id from demo_ids);

delete from stock_events where item_id in (select id from demo_ids);
delete from order_items where item_id in (select id from demo_ids);
delete from hold_lines where item_id in (select id from demo_ids);

create temp table empty_orders on commit drop as
  select id from touched_orders t where not exists (select 1 from order_items i where i.order_id = t.id);
delete from stock_events where order_id in (select id from empty_orders);
delete from order_events where order_id in (select id from empty_orders);
create temp table touched_checkouts on commit drop as
  select distinct checkout_id as id from orders where id in (select id from empty_orders);
delete from orders where id in (select id from empty_orders);
delete from checkouts k where k.id in (select id from touched_checkouts)
  and not exists (select 1 from orders o where o.checkout_id = k.id);
update orders o set total_agorot = coalesce((select sum(total_agorot) from order_items i where i.order_id = o.id and i.status = 'active'), 0)
where o.id in (select id from touched_orders) and o.status <> 'cancelled';

alter table cut_media disable trigger cut_media_guard_delete;
delete from cut_media where item_id in (select id from demo_ids);
alter table cut_media enable trigger cut_media_guard_delete;
delete from items where id in (select id from demo_ids);
delete from parents where id in (select id from demo_parents);
commit;
