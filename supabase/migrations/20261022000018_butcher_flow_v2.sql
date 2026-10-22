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
