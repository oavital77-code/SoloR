-- The butcher's flow, part 2: removes what is left of the `cuts` model after 0016 moved everything to parents and
-- items. Kept apart because dropping needs an explicit confirmation on the hosted database.

drop function if exists publish_cut(uuid), revert_to_draft(uuid), withdraw_cut(uuid), remove_cut(uuid),
  cut_has_active_orders(uuid), cut_has_sales(uuid, uuid), cut_held(uuid, uuid), checkout_line_total(cuts, order_mode, int),
  cut_holds(uuid[]), cut_missing_fields(cuts), compute_stock(cuts), max_steaks(int, int),
  store_sale_legacy(uuid, int, boolean), return_item_stock_legacy(order_items, uuid, text);

drop policy if exists cut_media_select_visible on cut_media;
drop policy if exists cut_media_manage_own on cut_media;
drop policy if exists cut_media_select_anon on cut_media;
drop policy if exists stock_events_select_butcher on stock_events;

-- the cuts' own media rows were copied to their items in 0016
delete from cut_media where item_id is null;
alter table cut_media drop column cut_id;
alter table cut_media alter column item_id set not null;

delete from stock_events where item_id is null;
alter table stock_events drop column cut_id, drop column steaks_delta, drop column whole_after;
alter table stock_events alter column item_id set not null;

alter table order_items drop column cut_id, drop column legacy_mode, drop column steaks_qty;

drop table hold_lines_legacy;
drop table cuts;
drop function if exists cuts_guard_update();
drop sequence if exists cut_code_seq;
drop type sale_mode;
drop type order_mode;
