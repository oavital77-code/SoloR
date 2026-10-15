-- Removes the demo catalogue (cuts whose media is served from /demo/), including any orders placed on them.
begin;
create temp table demo_ids on commit drop as
  select distinct cut_id as id from cut_media where storage_path like '/demo/%';
delete from order_events where order_id in (select id from orders where cut_id in (select id from demo_ids));
delete from orders where cut_id in (select id from demo_ids);
delete from stock_events where cut_id in (select id from demo_ids);
alter table cut_media disable trigger cut_media_guard_delete;
delete from cut_media where cut_id in (select id from demo_ids);
alter table cut_media enable trigger cut_media_guard_delete;
delete from cuts where id in (select id from demo_ids);
commit;
