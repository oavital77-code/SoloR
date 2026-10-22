-- Butcher flow v2 — going live on the production database (22.10.2026), in one transaction: all of it or nothing.
-- Run it once in the Supabase dashboard → SQL Editor (it runs as the owner). It is what these files do, in order:
--   1. discard_parent / cancel_unit (the part of 20261022000016 that was not applied yet)
--   2. supabase/migrations/20261022000017_drop_cuts_model.sql — the old cuts model goes
--   3. supabase/migrations/20261022000018_butcher_flow_v2.sql — clip numbers, sale mode, parent photos, trays
--   4. supabase/demo/remove_demo.sql + supabase/demo/seed_demo.sql — the demo counter again, in the v2 form
-- Real (non-demo) cuts, items and orders are kept. Generated from those files; do not edit by hand.
begin;

-- ───────── 1 ─────────
create or replace function discard_parent(p_parent_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  p parents := own_parent(p_parent_id);
begin
  if exists (select 1 from items where parent_id = p.id and status <> 'draft') then raise exception 'INVALID_TRANSITION'; end if;
  delete from parents where id = p.id;
end $$;

create or replace function cancel_unit(p_item_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  i items;
begin
  select * into i from items where id = p_item_id for update;
  if not found or i.butcher_id is distinct from current_butcher_id() then raise exception 'NOT_ALLOWED'; end if;
  if i.status <> 'draft' then raise exception 'INVALID_TRANSITION'; end if;
  delete from items where id = i.id;
end $$;

revoke execute on function discard_parent(uuid), cancel_unit(uuid) from public, anon, authenticated;
grant execute on function discard_parent(uuid), cancel_unit(uuid) to authenticated;

-- ───────── 2: 20261022000017_drop_cuts_model ─────────
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

-- ───────── 3: 20261022000018_butcher_flow_v2 ─────────
-- The butcher's flow, version 2 (docs/BUTCHER_FLOW_v2.md, decided 22.10.2026).
--
--   * The parent's number is the clip the butcher takes from the drawer: typed in (set_parent_code), not given by a
--     sequence. Two active parents of a shop never share a number; a parent is active while anything of it is still
--     on sale or being prepared. Once all of it is sold or removed, its clip goes back to the drawer (Q1).
--   * The parent has its own photos (cut_media.parent_id) and its weight.
--   * A sale mode replaces "split yes/no": block (the whole cut by weight), steaks (trays only) or both.
--   * A tray (unit) gets its number when it is confirmed — the next one in the parent, shown as "15-01" (Q2) — so a
--     tray dropped before confirming uses no number.
--   * The block goes live through publish_block: at once for "block"; for "both" only after the cutting is done,
--     with the weight of what is left weighed again (Q3, Q4). "פרוס לי" stays (Q5).

-- ───────── columns ─────────
alter table parents drop constraint if exists parents_code_key;
alter table parents
  add column sale_mode text check (sale_mode in ('block', 'steaks', 'both')),
  add column weight_g  int  check (weight_g between 50 and 50000),
  add constraint parents_code_range check (code between 1 and 9999);
create index on parents (butcher_id, code);
update parents p set sale_mode = case
  when p.split is false then 'block'
  when exists (select 1 from items i where i.parent_id = p.id and i.kind = 'remainder') then 'both'
  when p.split then 'steaks' end;
update parents p set weight_g = (select sum(i.weight_g) from items i where i.parent_id = p.id)
where weight_g is null and exists (select 1 from items i where i.parent_id = p.id and i.weight_g between 50 and 50000);

-- a tray has no number (and no label) until it is confirmed
alter table items drop constraint if exists items_check;
alter table items alter column label drop not null;
alter table items
  add constraint items_unit_no_only_units check (kind = 'unit' or unit_no is null),
  add constraint items_live_numbered check (status = 'draft' or (label is not null and (kind = 'remainder' or unit_no is not null)));

-- the parent's own photos
alter table cut_media add column parent_id uuid references parents(id) on delete cascade;
alter table cut_media alter column item_id drop not null;
alter table cut_media add constraint cut_media_one_owner check ((item_id is null) <> (parent_id is null));
create index on cut_media (parent_id, sort_order);

-- ───────── helpers ─────────
-- "15-01"
create or replace function unit_label(p_code int, p_unit_no int) returns text
language sql immutable as $$ select p_code || '-' || lpad(p_unit_no::text, 2, '0') $$;

-- Q1: the active parent of a shop holding a clip number (null = the number is free)
create or replace function parent_code_holder(p_butcher uuid, p_code int, p_except uuid) returns parents
language sql stable security definer set search_path = public as $$
  select p.* from parents p
  where p.butcher_id = p_butcher and p.code = p_code and p.id is distinct from p_except
    and (p.status <> 'closed' or exists (select 1 from items i where i.parent_id = p.id and i.status in ('draft', 'published')))
  order by p.created_at desc limit 1
$$;

-- R9: a tray needs its own photo; the block may show the parent's
create or replace function item_missing_fields(i items, p parents) returns text[]
language plpgsql stable security definer set search_path = public as $$
declare
  missing text[] := parent_missing_fields(p);
begin
  if not exists (select 1 from cut_media m where m.item_id = i.id and m.type = 'photo')
     and not (i.kind = 'remainder' and exists (select 1 from cut_media m where m.parent_id = p.id and m.type = 'photo')) then
    missing := array_append(missing, 'photos');
  end if;
  if coalesce(i.weight_g, 0) < 1 then missing := array_append(missing, 'weight_g'); end if;
  if coalesce(i.price_per_kg_agorot, p.price_per_kg_agorot) is null then missing := array_append(missing, 'price_per_kg'); end if;
  if i.kind = 'unit' and i.steak_count is null then missing := array_append(missing, 'steak_count'); end if;
  return missing;
end $$;

-- the parent's details may change until something of it is ordered; its weight is one of them
create or replace function parents_guard_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('solor.rpc', true), '') = 'on' then return new; end if;
  if new.id <> old.id or new.butcher_id <> old.butcher_id or new.code is distinct from old.code then
    raise exception 'NOT_ALLOWED';
  end if;
  if (new.cut_type, new.breed_key, new.breed_other, new.origin_country, new.is_aged, new.aging_days,
      new.aging_method, new.butcher_marbling, new.price_per_kg_agorot, new.weight_g)
     is distinct from
     (old.cut_type, old.breed_key, old.breed_other, old.origin_country, old.is_aged, old.aging_days,
      old.aging_method, old.butcher_marbling, old.price_per_kg_agorot, old.weight_g)
     and exists (select 1 from items i where i.parent_id = old.id and item_has_active_orders(i.id)) then
    raise exception 'HAS_ACTIVE_ORDERS';
  end if;
  return new;
end $$;

-- the last photo of something live stays
create or replace function cut_media_guard_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.type <> 'photo' then return old; end if;
  if old.item_id is not null
     and exists (select 1 from items i where i.id = old.item_id and i.status in ('published', 'sold_out')
                 and (i.kind = 'unit' or not exists (select 1 from cut_media m where m.parent_id = i.parent_id and m.type = 'photo')))
     and not exists (select 1 from cut_media m where m.item_id = old.item_id and m.type = 'photo' and m.id <> old.id)
  then
    raise exception 'LAST_PHOTO';
  end if;
  if old.parent_id is not null
     and exists (select 1 from items i where i.parent_id = old.parent_id and i.kind = 'remainder' and i.status in ('published', 'sold_out')
                 and not exists (select 1 from cut_media m where m.item_id = i.id and m.type = 'photo'))
     and not exists (select 1 from cut_media m where m.parent_id = old.parent_id and m.type = 'photo' and m.id <> old.id)
  then
    raise exception 'LAST_PHOTO';
  end if;
  return old;
end $$;

-- ───────── the flow ─────────
-- "סיים וידאו": the recording is over (the number comes from the clip, later)
create or replace function stop_recording(p_parent_id uuid, p_video_path text default null) returns parents
language plpgsql security definer set search_path = public as $$
declare
  p parents := own_parent(p_parent_id);
begin
  if p.status <> 'recording' then return p; end if;                       -- a second tap
  if p_video_path is not null and p_video_path not like p.butcher_id::text || '/%' then raise exception 'NOT_ALLOWED'; end if;
  perform set_config('solor.rpc', 'on', true);
  update parents set status = 'details', video_path = coalesce(p_video_path, video_path) where id = p.id returning * into p;
  perform set_config('solor.rpc', 'off', true);
  return p;
end $$;

-- The clip's number (R1, R2). It can be corrected while nothing of the parent was sold; the labels follow it.
create or replace function set_parent_code(p_parent_id uuid, p_code int) returns parents
language plpgsql security definer set search_path = public as $$
declare
  p parents := own_parent(p_parent_id);
  h parents;
begin
  if p.status = 'recording' then raise exception 'INVALID_TRANSITION'; end if;
  if p_code is null or p_code not between 1 and 9999 then raise exception 'INVALID_CODE'; end if;
  if p.code = p_code then return p; end if;
  h := parent_code_holder(p.butcher_id, p_code, p.id);
  if h.id is not null then
    raise exception 'CODE_IN_USE' using detail = jsonb_build_object('cut_type', h.cut_type, 'created_at', h.created_at)::text;
  end if;
  if exists (select 1 from items i where i.parent_id = p.id
             and (exists (select 1 from order_items l where l.item_id = i.id)
                  or exists (select 1 from stock_events s where s.item_id = i.id and s.type = 'store_sale'))) then
    raise exception 'CODE_LOCKED';
  end if;
  perform set_config('solor.rpc', 'on', true);
  update parents set code = p_code where id = p.id returning * into p;
  update items set label = case when kind = 'unit' then unit_label(p_code, unit_no) else p_code::text end
  where parent_id = p.id and label is not null;
  perform set_config('solor.rpc', 'off', true);
  return p;
end $$;

-- "אופן מכירה": block / steaks / both. It can change until a tray or the block exists.
create or replace function set_sale_mode(p_parent_id uuid, p_mode text) returns parents
language plpgsql security definer set search_path = public as $$
declare
  p parents := own_parent(p_parent_id);
begin
  if p_mode is null or p_mode not in ('block', 'steaks', 'both') then raise exception 'INVALID_TRANSITION'; end if;
  if p.code is null or p.status not in ('details', 'splitting') then raise exception 'INVALID_TRANSITION'; end if;
  if p.sale_mode is distinct from p_mode then
    if p_mode = 'block' and exists (select 1 from items where parent_id = p.id and kind = 'unit') then raise exception 'HAS_UNITS'; end if;
    if exists (select 1 from items where parent_id = p.id and kind = 'remainder') then raise exception 'INVALID_TRANSITION'; end if;
  end if;
  perform set_config('solor.rpc', 'on', true);
  update parents set sale_mode = p_mode, split = p_mode <> 'block', status = 'splitting' where id = p.id returning * into p;
  perform set_config('solor.rpc', 'off', true);
  return p;
end $$;

-- "➕ תת יחידה": a draft tray, still without a number (it gets one when confirmed, R3)
create or replace function new_unit(p_parent_id uuid) returns items
language plpgsql security definer set search_path = public as $$
declare
  p parents := own_parent(p_parent_id);
  i items;
  v_steaks int;
begin
  if p.status <> 'splitting' or p.sale_mode not in ('steaks', 'both') then raise exception 'INVALID_TRANSITION'; end if;
  if exists (select 1 from items where parent_id = p.id and kind = 'remainder' and status <> 'draft') then
    raise exception 'INVALID_TRANSITION';                         -- the cutting is over: what was left is on sale
  end if;
  select steak_count into v_steaks from items where parent_id = p.id and kind = 'unit'
  order by unit_no desc nulls first, created_at desc limit 1;
  insert into items (parent_id, butcher_id, kind, steak_count) values (p.id, p.butcher_id, 'unit', coalesce(v_steaks, 2))
  returning * into i;
  return i;
end $$;

-- "✅ אשר": a tray goes live and takes the next number of its parent ("15-01"); the price per kg is fixed on it
create or replace function publish_item(p_item_id uuid) returns items
language plpgsql security definer set search_path = public as $$
declare
  i items;
  p parents;
  missing text[];
begin
  select * into i from items where id = p_item_id;
  if not found then raise exception 'NOT_ALLOWED'; end if;
  p := own_parent(i.parent_id);
  select * into i from items where id = p_item_id for update;
  if i.status <> 'draft' then raise exception 'INVALID_TRANSITION'; end if;
  missing := item_missing_fields(i, p);
  if array_length(missing, 1) > 0 then raise exception 'MISSING_FIELDS' using detail = array_to_string(missing, ','); end if;

  perform set_config('solor.rpc', 'on', true);
  if i.kind = 'unit' then
    update parents set next_unit_no = next_unit_no + 1 where id = p.id;
    update items set unit_no = p.next_unit_no, label = unit_label(p.code, p.next_unit_no) where id = i.id;
  else
    update items set label = p.code::text where id = i.id;
  end if;
  update items set status = 'published', published_at = now(), sold_out_at = null,
                   price_per_kg_agorot = coalesce(i.price_per_kg_agorot, p.price_per_kg_agorot)
  where id = i.id returning * into i;
  if p.status = 'details' then update parents set status = 'splitting' where id = p.id; end if;
  perform set_config('solor.rpc', 'off', true);

  insert into stock_events (item_id, type, weight_delta_g, weight_after_g, actor_id)
  values (i.id, 'publish', i.weight_g, i.weight_g, auth.uid());
  return i;
end $$;

-- The block goes live: for "block" at the parent's weight; for "both" once the cutting is done, at the weight of
-- what is left, weighed again (nothing left: no block). Its photos are the parent's.
create or replace function publish_block(p_parent_id uuid, p_weight_g int default null) returns items
language plpgsql security definer set search_path = public as $$
declare
  p parents := own_parent(p_parent_id);
  i items;
  v_weight int;
  v_drafts text;
begin
  if p.code is null or p.status not in ('details', 'splitting') then raise exception 'INVALID_TRANSITION'; end if;
  if p.sale_mode = 'block' then
    v_weight := coalesce(p_weight_g, p.weight_g);
  elsif p.sale_mode = 'both' then
    select string_agg(coalesce(label, '…'), ',') into v_drafts from items where parent_id = p.id and kind = 'unit' and status = 'draft';
    if v_drafts is not null then raise exception 'HAS_DRAFTS' using detail = v_drafts; end if;
    v_weight := p_weight_g;
    if coalesce(v_weight, 0) = 0 then return null; end if;       -- all of it went into trays
  else
    raise exception 'INVALID_TRANSITION';
  end if;
  if v_weight is null or v_weight not between 1 and 50000 then raise exception 'INVALID_WEIGHT'; end if;

  select * into i from items where parent_id = p.id and kind = 'remainder' for update;
  if i.id is not null and i.status <> 'draft' then raise exception 'INVALID_TRANSITION'; end if;
  perform set_config('solor.rpc', 'on', true);
  if i.id is null then
    insert into items (parent_id, butcher_id, kind, weight_g, weight_source) values (p.id, p.butcher_id, 'remainder', v_weight, 'manual')
    returning * into i;
  else
    update items set weight_g = v_weight, weight_source = 'manual' where id = i.id returning * into i;
  end if;
  perform set_config('solor.rpc', 'off', true);
  return publish_item(i.id);
end $$;

-- "סיום": nothing half done; the video switch
create or replace function close_parent(p_parent_id uuid, p_video_published boolean default null) returns parents
language plpgsql security definer set search_path = public as $$
declare
  p parents := own_parent(p_parent_id);
  v_drafts int;
begin
  if p.code is null then raise exception 'INVALID_TRANSITION'; end if;
  select count(*) into v_drafts from items where parent_id = p.id and status = 'draft';
  if v_drafts > 0 then raise exception 'HAS_DRAFTS' using detail = v_drafts::text; end if;
  perform set_config('solor.rpc', 'on', true);
  update parents set status = 'closed', closed_at = coalesce(closed_at, now()), paused_at = null,
                     video_published = coalesce(p_video_published, video_published)
  where id = p.id returning * into p;
  perform set_config('solor.rpc', 'off', true);
  return p;
end $$;

-- the old "split yes/no" and the remainder created by hand give way to set_sale_mode and publish_block
drop function if exists set_split(uuid, boolean);
drop function if exists create_remainder(uuid);

-- trays already numbered keep their number, written the v2 way ("9-1" → "9-01", what the butcher types at the counter)
select set_config('solor.rpc', 'on', true);
update items i set label = unit_label(p.code, i.unit_no) from parents p
where p.id = i.parent_id and i.kind = 'unit' and i.unit_no is not null and p.code is not null
  and i.label is distinct from unit_label(p.code, i.unit_no);
select set_config('solor.rpc', 'off', true);

-- ───────── RLS + grants ─────────
grant update (weight_g) on parents to authenticated;
grant insert (parent_id) on cut_media to authenticated;

create policy cut_media_parent_select_public on cut_media for select to anon, authenticated
  using (parent_id is not null and exists (select 1 from items i where i.parent_id = cut_media.parent_id
                                           and item_is_public(i.status, i.published_at)));
create policy cut_media_parent_select_own on cut_media for select to authenticated
  using (exists (select 1 from parents p where p.id = cut_media.parent_id and p.butcher_id = current_butcher_id()));
create policy cut_media_parent_manage_own on cut_media for all to authenticated
  using (exists (select 1 from parents p where p.id = cut_media.parent_id and p.butcher_id = current_butcher_id()))
  with check (exists (select 1 from parents p where p.id = cut_media.parent_id and p.butcher_id = current_butcher_id()));

revoke execute on function unit_label(int, int), parent_code_holder(uuid, int, uuid), set_parent_code(uuid, int),
  set_sale_mode(uuid, text), publish_block(uuid, int) from public, anon, authenticated;
grant execute on function set_parent_code(uuid, int), set_sale_mode(uuid, text), publish_block(uuid, int) to authenticated;

-- ───────── 4: the demo counter, v2 ─────────
-- Removes the demo counter (parents whose items show media from /demo/), including any orders placed on them.
-- Order lines on demo items are deleted; shop orders and purchases left without lines go with them.
create temp table demo_parents on commit drop as
  select distinct i.parent_id as id from cut_media m join items i on i.id = m.item_id where m.storage_path like '/demo/%'
  union select parent_id from cut_media where parent_id is not null and storage_path like '/demo/%'
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
delete from holds h where h.checkout_id in (select id from touched_checkouts)
  and not exists (select 1 from orders o where o.checkout_id = h.checkout_id);
delete from checkouts k where k.id in (select id from touched_checkouts)
  and not exists (select 1 from orders o where o.checkout_id = k.id);
update orders o set total_agorot = coalesce((select sum(total_agorot) from order_items i where i.order_id = o.id and i.status = 'active'), 0)
where o.id in (select id from touched_orders) and o.status <> 'cancelled';

alter table cut_media disable trigger cut_media_guard_delete;
delete from cut_media where item_id in (select id from demo_ids) or parent_id in (select id from demo_parents);
alter table cut_media enable trigger cut_media_guard_delete;
delete from items where id in (select id from demo_ids);
delete from parents where id in (select id from demo_parents);

-- Demo counter (docs/BUTCHER_FLOW_v2.md): 10 parent cuts with generated media served by the app itself (public/demo/dNN).
-- Each parent has its clip number; "steaks"/"both" parents carry trays ("15-01" …) and, for "both", the block of what
-- was left; "block" parents are sold whole by weight. For showing the product only. Remove with supabase/demo/remove_demo.sql.
-- Runs as the database owner, with the RPC guard flag set (what publish_item would do, without the photo step).
select set_config('solor.rpc', 'on', true);

create temp table demo_in (
  key text, shop text, clip int, cut_type cut_type, breed_key text, breed_other text, origin origin_country,
  aged boolean, aging_days int, aging_method aging_method, marbling smallint, description text,
  price_kg int, hours_ago numeric, video boolean,
  units text,          -- 'steaks:grams,…' ('' = not split)
  remainder_g int      -- what is back on the counter (null = nothing left)
) on commit drop;

insert into demo_in values
 ('d01','butcher-1',15,'entrecote','black_angus',null,'AR',true,28,'dry',8,'אנטריקוט מהצלע הגבוהה, שיש עדין לאורך כל הנתח ושכבת שומן מלאה בצד. מושלם לגריל חם.',22000,0.4,true,'3:1240,2:830,3:1180',1100),
 ('d02','butcher-1',42,'picanha','villa_mercedes',null,'UY',false,null,null,6,'פיקניה שלמה עם כובע שומן עבה. לצלייה בשלמותה או לחיתוך לסטייקים לאורך הסיבים.',16000,2,true,'',1600),
 ('d03','test-b',8,'ontrib',null,'הולשטיין','IL',true,21,'wet',7,'אונטריב עם עצם, יושן בוואקום. מתאים לבישול ארוך או לצלייה איטית.',14500,5,true,'',2800),
 ('d04','test-b',23,'asado','black_angus',null,'AR',false,null,null,6,'רצועת אסאדו עם שלוש עצמות, לעישון או לצלייה ארוכה על גחלים.',11000,7,true,'',3200),
 ('d05','butcher-1',61,'sinta','wagyu',null,'AU',true,35,'dry',10,'סינטה ואגיו אוסטרלי, שיש צפוף מאוד. פרוסות דקות, צלייה קצרה מאוד.',69000,1,true,'2:520,2:490',780),
 ('d06','test-b',4,'denver','villa_mercedes',null,'PY',false,null,null,7,'דנוור — נתח מהכתף, רך וטעים, במחיר נוח. לסטייקים דקים.',17500,9,false,'3:610,3:590,2:420',null),
 ('d07','butcher-1',77,'shaitel',null,'אנגוס מקומי','IL',true,14,'dry',5,'שייטל רזה עם קצה שומן, יושן שבועיים. לסטייקים או לרוסטביף.',13000,12,false,'',2000),
 ('d08','butcher-1',9,'entrecote','wagyu',null,'JP',true,21,'wet',10,'אנטריקוט ואגיו יפני, דרגת שיש גבוהה במיוחד. כמות מוגבלת.',120000,0.2,true,'1:210,2:430',null),
 ('d09','test-b',33,'sinta','black_angus',null,'UY',true,28,'dry',7,'סינטה מיושנת יבש 28 יום, טעם עמוק ואגוזי. מגיעה עם שכבת שומן.',18500,3,true,'2:640,2:610',950),
 ('d10','test-b',50,'picanha','black_angus',null,'AR',true,14,'dry',6,'פיקניה בלאק אנגוס מיושנת, חתוכה לסטייקים עם כובע השומן.',17000,20,false,'2:600,2:580,2:560',null);

create temp table demo_parent (key text, id uuid, code int) on commit drop;
with ins as (
  insert into parents (code, butcher_id, status, split, sale_mode, weight_g, cut_type, breed_key, breed_other, origin_country, is_aged, aging_days,
                       aging_method, butcher_marbling, description, price_per_kg_agorot, video_path, video_poster_path,
                       next_unit_no, created_at, closed_at)
  select case when (parent_code_holder(b.id, d.clip, null)).id is null then d.clip else d.clip + 100 end,   -- a real cut holds it: another clip
         b.id, 'closed', d.units <> '',
         case when d.units = '' then 'block' when d.remainder_g is null then 'steaks' else 'both' end,
         (select coalesce(sum(split_part(x, ':', 2)::int), 0) from unnest(string_to_array(nullif(d.units, ''), ',')) x)
           + coalesce(d.remainder_g, 0) + 150,
         d.cut_type, d.breed_key, d.breed_other, d.origin, d.aged,
         d.aging_days, d.aging_method, d.marbling, d.description, d.price_kg,
         case when d.video then '/demo/' || d.key || '/clip.mp4' end, case when d.video then '/demo/' || d.key || '/1.jpg' end,
         coalesce(array_length(string_to_array(nullif(d.units, ''), ','), 1), 0) + 1,
         now() - make_interval(secs => (d.hours_ago * 3600 + 900)::int), now() - make_interval(secs => (d.hours_ago * 3600)::int)
  from demo_in d join butchers b on b.slug = d.shop
  returning id, code, description
)
insert into demo_parent select d.key, ins.id, ins.code from ins join demo_in d on d.description = ins.description;

create temp table demo_item (key text, id uuid, n int) on commit drop;
with u as (
  select d.key, p.id as parent_id, p.code, b.id as butcher_id, d.price_kg, d.hours_ago, x.n::int as n,
         split_part(x.s, ':', 1)::int as steaks, split_part(x.s, ':', 2)::int as grams
  from demo_in d join demo_parent p using (key) join butchers b on b.slug = d.shop
  cross join lateral unnest(string_to_array(nullif(d.units, ''), ',')) with ordinality as x(s, n)
), ins as (
  insert into items (parent_id, butcher_id, kind, unit_no, label, steak_count, weight_g, price_per_kg_agorot, weight_source,
                     status, published_at, created_at)
  select parent_id, butcher_id, 'unit', n, unit_label(code, n), steaks, grams, price_kg, 'scan', 'published',
         now() - make_interval(secs => (hours_ago * 3600)::int + 60 * (4 - n)), now() - make_interval(secs => (hours_ago * 3600)::int + 600)
  from u
  returning id, parent_id, unit_no
)
insert into demo_item select p.key, ins.id, ins.unit_no from ins join demo_parent p on p.id = ins.parent_id;

with ins as (
  insert into items (parent_id, butcher_id, kind, label, weight_g, price_per_kg_agorot, weight_source, status, published_at, created_at)
  select p.id, b.id, 'remainder', p.code::text, d.remainder_g, d.price_kg, 'manual', 'published',
         now() - make_interval(secs => (d.hours_ago * 3600)::int), now() - make_interval(secs => (d.hours_ago * 3600)::int + 600)
  from demo_in d join demo_parent p using (key) join butchers b on b.slug = d.shop
  where d.remainder_g is not null
  returning id, parent_id
)
insert into demo_item select p.key, ins.id, 0 from ins join demo_parent p on p.id = ins.parent_id;

-- photos: the parent has the three shots of its cut (the block shows them); every tray its own, a different one first
insert into cut_media (parent_id, type, storage_path, thumb_path, is_cover, sort_order, width, height)
select p.id, 'photo', '/demo/' || p.key || '/' || k || '.jpg', '/demo/' || p.key || '/' || k || '-t.jpg', k = 1, k - 1, 1080, 1350
from demo_parent p cross join generate_series(1, 3) k;
insert into cut_media (item_id, type, storage_path, thumb_path, is_cover, sort_order, width, height)
select i.id, 'photo', '/demo/' || i.key || '/' || k || '.jpg', '/demo/' || i.key || '/' || k || '-t.jpg',
       k = (i.n % 3) + 1, (k - (i.n % 3) - 1 + 3) % 3, 1080, 1350
from demo_item i cross join generate_series(1, 3) k where i.n > 0;

insert into stock_events (item_id, type, weight_delta_g, weight_after_g, reason)
select it.id, 'publish', it.weight_g, it.weight_g, 'demo' from items it join demo_item i on i.id = it.id;

select p.code, b.slug, p.cut_type, p.sale_mode, string_agg(it.label || ' ' || it.weight_g || 'g', ', ' order by it.unit_no nulls last) as items
from demo_parent dp join parents p on p.id = dp.id join butchers b on b.id = p.butcher_id join items it on it.parent_id = p.id
group by p.code, b.slug, p.cut_type, p.sale_mode order by p.code;

-- the migration history, as the dashboard shows it
insert into supabase_migrations.schema_migrations (version, name) values
  ('20261022120001', 'butcher_flow_5b_discard_cancel'), ('20261022120002', 'drop_cuts_model'), ('20261022120003', 'butcher_flow_v2')
on conflict do nothing;

commit;
