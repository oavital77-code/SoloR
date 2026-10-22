-- The butcher's flow (docs/BUTCHER_FLOW.md, 22.10.2026): a parent cut is split into sale units, the rest goes back
-- to the counter as a remainder sold by weight. Replaces the `cuts` model (SPEC §7.3, the stock rules of §6).
--
--   parents   the cut taken out of the counter: details, price per kg and the video. Never sold itself.
--             code is a running number given when the recording stops (R1).
--   items     what is sold: a unit ('523-1', sold whole at weight × price, R6) or the parent's remainder ('523',
--             sold by weight: all of it, or "פרוס לי" up to 95% of what is left, R13/R14). Not splitting = only
--             a remainder (the whole cut). Unit numbers come from parents.next_unit_no and are never reused (R3).
--   cut_media now holds the photos of an item; the video is on the parent.
--   order_items / hold_lines / stock_events point at items; an order line is a unit, the whole remainder or a slice.
--
-- Existing cuts are moved over: a cut sold only whole becomes a parent with its remainder; a cut sold by the
-- steak becomes a split parent whose steaks are units of two (every past order line keeps its own unit).
-- Then the old model (cuts, its functions, sale_mode / steak columns) is removed.

-- ───────── types ─────────
create type item_kind     as enum ('unit', 'remainder');
create type parent_status as enum ('recording', 'details', 'splitting', 'closed');
create type line_mode     as enum ('unit', 'remainder_all', 'remainder_slice');

-- ───────── parents ─────────
create sequence parent_code_seq start 1;
create table parents (
  id                  uuid primary key default gen_random_uuid(),
  code                int unique,                                  -- given by stop_recording (R1)
  butcher_id          uuid not null references butchers(id),
  status              parent_status not null default 'recording',
  split               boolean,                                     -- true = units, false = sold whole by weight
  cut_type            cut_type,
  breed_key           text references breeds(key),
  breed_other         text check (char_length(breed_other) <= 60),
  origin_country      origin_country,
  is_aged             boolean,
  aging_days          int check (aging_days between 1 and 365),
  aging_method        aging_method,
  butcher_marbling    smallint check (butcher_marbling between 1 and 10),
  description         text check (char_length(description) <= 500),
  price_per_kg_agorot int check (price_per_kg_agorot between 100 and 500000),
  video_path          text,
  video_poster_path   text,
  video_published     boolean not null default true,               -- R12
  next_unit_no        int not null default 1,                      -- R2/R3: never goes back
  paused_at           timestamptz,                                 -- R17: "השהה ופתח חדש"
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  closed_at           timestamptz
);
create index on parents (butcher_id, status, created_at desc);

-- ───────── items ─────────
create table items (
  id                  uuid primary key default gen_random_uuid(),
  parent_id           uuid not null references parents(id) on delete cascade,
  butcher_id          uuid not null references butchers(id),
  kind                item_kind not null,
  unit_no             int,
  label               text not null,                               -- '523-2' / '523'
  steak_count         int check (steak_count between 1 and 40),
  weight_g            int check (weight_g between 0 and 50000),    -- unit: final; remainder: the balance
  price_per_kg_agorot int check (price_per_kg_agorot between 100 and 500000),   -- null = the parent's (R11)
  weight_source       text check (weight_source in ('scan', 'manual')),
  status              cut_status not null default 'draft',
  published_at        timestamptz,
  sold_out_at         timestamptz,                                 -- for the "sold" tail of the feed
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (parent_id, unit_no),
  check ((kind = 'unit') = (unit_no is not null)),
  check (kind = 'unit' or steak_count is null)
);
create unique index one_remainder_per_parent on items (parent_id) where kind = 'remainder';
create index on items (status, published_at desc);
create index on items (butcher_id, status);

create trigger parents_updated_at before update on parents for each row execute function set_updated_at();
create trigger items_updated_at   before update on items   for each row execute function set_updated_at();

-- ───────── links of the other tables ─────────
alter table cut_media    add column item_id uuid references items(id) on delete cascade,
                         alter column cut_id drop not null;
alter table order_items  add column item_id uuid references items(id),
                         add column line line_mode,
                         add column requested_g int check (requested_g between 50 and 50000),
                         add column slice_thickness_cm numeric(3,1) check (slice_thickness_cm between 1 and 8);
alter table stock_events add column item_id uuid references items(id) on delete cascade,
                         add column weight_delta_g int not null default 0,
                         add column weight_after_g int;

-- the shop's scale labels (chapter 7, W1): {"prefix","value_type":"weight"|"price","value_start","value_length","unit"}
alter table butchers add column if not exists scale_barcode_config jsonb
  check (scale_barcode_config is null or jsonb_typeof(scale_barcode_config) = 'object');

-- ───────── move the existing cuts over ─────────
do $$
declare
  c record;
  li record;
  v_parent uuid;
  v_code int;
  v_split boolean;
  v_n int;
  v_left int;
  v_k int;
  v_item uuid;
  v_first uuid;
  v_video record;
begin
  for c in select * from cuts order by code loop
    v_code  := nullif(regexp_replace(c.code, '[^0-9]', '', 'g'), '')::int;
    v_split := c.status <> 'draft' and c.sale_mode in ('steaks', 'both');
    select storage_path, poster_path into v_video from cut_media
      where cut_id = c.id and type = 'video' order by sort_order limit 1;

    insert into parents (code, butcher_id, status, split, cut_type, breed_key, breed_other, origin_country, is_aged,
                         aging_days, aging_method, butcher_marbling, description, price_per_kg_agorot,
                         video_path, video_poster_path, created_at, closed_at)
    values (v_code, c.butcher_id, case when c.status = 'draft' then 'splitting' else 'closed' end::parent_status,
            v_split, c.cut_type, c.breed_key, c.breed_other, c.origin_country, c.is_aged, c.aging_days, c.aging_method,
            c.butcher_marbling, c.description, c.price_per_kg_agorot, v_video.storage_path, v_video.poster_path,
            c.created_at, case when c.status <> 'draft' then coalesce(c.published_at, c.created_at) end)
    returning id into v_parent;
    v_first := null;

    if not v_split then
      -- sold whole (or still a draft): the cut is the parent's remainder
      insert into items (parent_id, butcher_id, kind, label, weight_g, price_per_kg_agorot, weight_source, status,
                         published_at, sold_out_at, created_at)
      values (v_parent, c.butcher_id, 'remainder', v_code::text,
              case when c.status in ('draft', 'published') and (c.status = 'draft' or c.whole_available) then c.weight_g
                   when c.status = 'withdrawn' then c.weight_g else 0 end,
              case when c.status <> 'draft' then c.price_per_kg_agorot end, 'manual',
              case when c.status = 'published' and not c.whole_available then 'sold_out'::cut_status else c.status end,
              c.published_at,
              case when c.status = 'sold_out' or (c.status = 'published' and not c.whole_available)
                   then coalesce(c.sold_out_at, now()) end,
              c.created_at)
      returning id into v_first;
      update order_items set item_id = v_first, line = 'remainder_all' where cut_id = c.id;
    else
      v_n := 0;
      -- every past order line gets its own unit
      for li in select * from order_items where cut_id = c.id order by created_at loop
        v_n := v_n + 1;
        insert into items (parent_id, butcher_id, kind, unit_no, label, steak_count, weight_g, price_per_kg_agorot,
                           weight_source, status, published_at, sold_out_at, created_at)
        values (v_parent, c.butcher_id, 'unit', v_n, v_code || '-' || v_n,
                least(40, greatest(1, coalesce(li.steaks_qty, c.steaks_total, 1))), li.est_weight_g, li.price_per_kg_agorot,
                'manual', case when li.status = 'active' then 'sold_out' else 'withdrawn' end::cut_status,
                c.published_at, li.created_at, c.created_at)
        returning id into v_item;
        v_first := coalesce(v_first, v_item);
        update order_items set item_id = v_item, line = 'unit' where id = li.id;
      end loop;
      -- what is still on the counter: units of two steaks
      v_left := case when c.status = 'sold_out' then 0 else c.steaks_available end;
      while v_left > 0 loop
        v_n := v_n + 1;
        v_k := least(2, v_left);
        insert into items (parent_id, butcher_id, kind, unit_no, label, steak_count, weight_g, price_per_kg_agorot,
                           weight_source, status, published_at, created_at)
        values (v_parent, c.butcher_id, 'unit', v_n, v_code || '-' || v_n, v_k, v_k * c.steak_weight_g,
                c.price_per_kg_agorot, 'manual', c.status, c.published_at, c.created_at)
        returning id into v_item;
        v_first := coalesce(v_first, v_item);
        v_left := v_left - v_k;
      end loop;
      if v_first is null then   -- everything went in the shop: keep one sold unit so the page has something
        v_n := v_n + 1;
        insert into items (parent_id, butcher_id, kind, unit_no, label, steak_count, weight_g, price_per_kg_agorot,
                           weight_source, status, published_at, sold_out_at, created_at)
        values (v_parent, c.butcher_id, 'unit', v_n, v_code || '-' || v_n, greatest(1, least(40, c.steaks_total)),
                coalesce(c.weight_g, 0), c.price_per_kg_agorot, 'manual', 'sold_out', c.published_at,
                coalesce(c.sold_out_at, now()), c.created_at)
        returning id into v_first;
      end if;
      update parents set next_unit_no = v_n + 1 where id = v_parent;
    end if;

    -- the photos go to every item of the parent; the stock history to its first item
    insert into cut_media (item_id, cut_id, type, storage_path, thumb_path, poster_path, is_cover, sort_order,
                           width, height, duration_s, created_at)
    select it.id, null, m.type, m.storage_path, m.thumb_path, m.poster_path, m.is_cover, m.sort_order,
           m.width, m.height, m.duration_s, m.created_at
    from cut_media m cross join items it
    where m.cut_id = c.id and m.type = 'photo' and it.parent_id = v_parent;
    update stock_events set item_id = coalesce((select i.item_id from order_items i
                                                where i.order_id = stock_events.order_id and i.cut_id = c.id limit 1), v_first)
    where cut_id = c.id;
  end loop;
  perform setval('parent_code_seq', greatest(coalesce((select max(code) from parents), 0), 1),
                 (select max(code) from parents) is not null);
end $$;

-- holds are short-lived: release what is open (the customer simply holds again) and start the lines afresh
-- (the old lines are kept aside until 0017 removes the old model)
update holds set status = 'released', released_at = now() where status = 'active';
alter table hold_lines rename to hold_lines_legacy;
alter index if exists hold_lines_cut rename to hold_lines_legacy_cut;
alter table hold_lines_legacy rename constraint hold_lines_pkey to hold_lines_legacy_pkey;
create table hold_lines (
  hold_id     uuid not null references holds(id) on delete cascade,
  item_id     uuid not null references items(id) on delete cascade,
  mode        line_mode not null,
  requested_g int,
  primary key (hold_id, item_id)
);
create index hold_lines_item on hold_lines (item_id);
-- carts on accounts hold cut lines the new app cannot read
update carts set lines = '[]'::jsonb, updated_at = now() where jsonb_array_length(lines) > 0;

-- ───────── the old model steps aside ─────────
-- Nothing is dropped here: `cuts` and the old columns stay, unused, until 0017 removes them (dropping needs an
-- explicit confirmation on the hosted database). Their NOT NULLs are lifted so the new rows can be written.
alter table order_items alter column cut_id drop not null;
alter table order_items rename column mode to legacy_mode;
alter table order_items alter column legacy_mode drop not null;
alter table order_items rename column line to mode;
alter table order_items alter column item_id set not null, alter column mode set not null;
create index on order_items (item_id, status);

alter table stock_events alter column cut_id drop not null;
create index on stock_events (item_id, created_at);
create index on cut_media (item_id, sort_order);

-- the old RPCs: two whose names are reused with other arguments step aside; none can be called any more
alter function store_sale(uuid, int, boolean) rename to store_sale_legacy;
alter function return_item_stock(order_items, uuid, text) rename to return_item_stock_legacy;
revoke execute on function publish_cut(uuid), revert_to_draft(uuid), withdraw_cut(uuid), remove_cut(uuid),
  cut_holds(uuid[]), store_sale_legacy(uuid, int, boolean), return_item_stock_legacy(order_items, uuid, text)
from public, anon, authenticated;

-- ───────── helpers (internal) ─────────
create or replace function slice_min_g()  returns int language sql immutable as $$ select 200 $$;   -- Q4
create or replace function slice_step_g() returns int language sql immutable as $$ select 50 $$;
-- R14: a slice may take up to 95% of what is free (5% kept for the knife); buying all of it takes 100%
create or replace function slice_max_g(p_free_g int) returns int language sql immutable as $$
  select greatest(0, (p_free_g::bigint * 95 / 100)::int)
$$;

-- visible to customers: live, sold, or withdrawn after having been live (so realtime can remove the card)
create or replace function item_is_public(p_status cut_status, p_published_at timestamptz) returns boolean
language sql immutable as $$
  select p_status in ('published', 'sold_out') or (p_status = 'withdrawn' and p_published_at is not null)
$$;

-- R9: what the parent still misses before anything of it can go live
create or replace function parent_missing_fields(p parents) returns text[]
language plpgsql stable set search_path = public as $$
declare
  missing text[] := '{}';
begin
  if p.code is null then missing := array_append(missing, 'code'); end if;
  if p.cut_type is null then missing := array_append(missing, 'cut_type'); end if;
  if p.breed_key is null and nullif(trim(coalesce(p.breed_other, '')), '') is null then
    missing := array_append(missing, 'breed');
  end if;
  if p.origin_country is null then missing := array_append(missing, 'origin_country'); end if;
  if p.is_aged is null then missing := array_append(missing, 'is_aged'); end if;
  if p.is_aged and p.aging_days is null then missing := array_append(missing, 'aging_days'); end if;
  return missing;
end $$;

create or replace function item_missing_fields(i items, p parents) returns text[]
language plpgsql stable security definer set search_path = public as $$
declare
  missing text[] := parent_missing_fields(p);
begin
  if not exists (select 1 from cut_media m where m.item_id = i.id and m.type = 'photo') then
    missing := array_append(missing, 'photos');
  end if;
  if coalesce(i.weight_g, 0) < 1 then missing := array_append(missing, 'weight_g'); end if;
  if coalesce(i.price_per_kg_agorot, p.price_per_kg_agorot) is null then missing := array_append(missing, 'price_per_kg'); end if;
  if i.kind = 'unit' and i.steak_count is null then missing := array_append(missing, 'steak_count'); end if;
  return missing;
end $$;

create or replace function item_has_active_orders(p_item_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from order_items i join orders o on o.id = i.order_id
                 where i.item_id = p_item_id and i.status = 'active' and o.status in ('new', 'preparing', 'ready'))
$$;

create or replace function own_parent(p_parent_id uuid) returns parents
language plpgsql security definer set search_path = public as $$
declare
  p parents;
begin
  select * into p from parents where id = p_parent_id for update;
  if not found or p.butcher_id is distinct from current_butcher_id() then raise exception 'NOT_ALLOWED'; end if;
  return p;
end $$;

-- ───────── edit guards ─────────
-- The butcher edits the parent's details directly (column grants). Once something of it is ordered and open,
-- only the description and the video switch may change. Status, code and unit numbers only through the RPCs.
create or replace function parents_guard_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('solor.rpc', true), '') = 'on' then return new; end if;
  if new.id <> old.id or new.butcher_id <> old.butcher_id or new.code is distinct from old.code then
    raise exception 'NOT_ALLOWED';
  end if;
  if (new.cut_type, new.breed_key, new.breed_other, new.origin_country, new.is_aged, new.aging_days,
      new.aging_method, new.butcher_marbling, new.price_per_kg_agorot)
     is distinct from
     (old.cut_type, old.breed_key, old.breed_other, old.origin_country, old.is_aged, old.aging_days,
      old.aging_method, old.butcher_marbling, old.price_per_kg_agorot)
     and exists (select 1 from items i where i.parent_id = old.id and item_has_active_orders(i.id)) then
    raise exception 'HAS_ACTIVE_ORDERS';
  end if;
  return new;
end $$;
create trigger parents_guard_update before update on parents for each row execute function parents_guard_update();

-- An item's weight, steaks and price are the butcher's to set while it is a draft; after that only the RPCs
-- (orders, store sales) move it (R6/R7).
create or replace function items_guard_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('solor.rpc', true), '') = 'on' then return new; end if;
  if old.status <> 'draft' then raise exception 'NOT_ALLOWED'; end if;
  return new;
end $$;
create trigger items_guard_update before update on items for each row execute function items_guard_update();

-- keep at least one photo on a live item
create or replace function cut_media_guard_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.type = 'photo'
     and exists (select 1 from items i where i.id = old.item_id and i.status in ('published', 'sold_out'))
     and not exists (select 1 from cut_media m where m.item_id = old.item_id and m.type = 'photo' and m.id <> old.id)
  then
    raise exception 'LAST_PHOTO';
  end if;
  return old;
end $$;

-- ───────── the butcher's flow (§9.2) ─────────
-- S0 → S1: a new parent, recording. One parent is worked on at a time (R17): another open one must be paused
-- explicitly ("השהה ופתח חדש"), otherwise PARENT_IN_PROGRESS with its id.
create or replace function start_parent(p_pause_current boolean default false) returns parents
language plpgsql security definer set search_path = public as $$
declare
  v_bid uuid := current_butcher_id();
  v_open uuid;
  p parents;
begin
  if v_bid is null then raise exception 'NOT_ALLOWED'; end if;
  perform 1 from butchers where id = v_bid for update;          -- one start at a time per shop
  select id into v_open from parents
    where butcher_id = v_bid and status <> 'closed' and paused_at is null order by created_at desc limit 1;
  if v_open is not null then
    if not coalesce(p_pause_current, false) then raise exception 'PARENT_IN_PROGRESS' using detail = v_open::text; end if;
    update parents set paused_at = now() where butcher_id = v_bid and status <> 'closed' and paused_at is null;
  end if;
  insert into parents (butcher_id) values (v_bid) returning * into p;
  return p;
end $$;

-- back to a paused parent (R16): the one being worked on is paused instead
create or replace function resume_parent(p_parent_id uuid) returns parents
language plpgsql security definer set search_path = public as $$
declare
  p parents := own_parent(p_parent_id);
begin
  if p.status = 'closed' then raise exception 'INVALID_TRANSITION'; end if;
  update parents set paused_at = now() where butcher_id = p.butcher_id and status <> 'closed' and paused_at is null and id <> p.id;
  update parents set paused_at = null where id = p.id returning * into p;
  return p;
end $$;

-- S1 "הפסק הקלטה": the code is given now (R1). The video may follow later (set_parent_video), or never.
create or replace function stop_recording(p_parent_id uuid, p_video_path text default null) returns parents
language plpgsql security definer set search_path = public as $$
declare
  p parents := own_parent(p_parent_id);
begin
  if p.status <> 'recording' then
    if p.code is not null then return p; end if;                 -- a second tap
    raise exception 'INVALID_TRANSITION';
  end if;
  if p_video_path is not null and p_video_path not like p.butcher_id::text || '/%' then raise exception 'NOT_ALLOWED'; end if;
  perform set_config('solor.rpc', 'on', true);
  update parents set code = nextval('parent_code_seq'), status = 'details', video_path = coalesce(p_video_path, video_path)
  where id = p.id returning * into p;
  perform set_config('solor.rpc', 'off', true);
  return p;
end $$;

-- the background upload finished (or the video is removed: null)
create or replace function set_parent_video(p_parent_id uuid, p_video_path text, p_poster_path text default null) returns parents
language plpgsql security definer set search_path = public as $$
declare
  p parents := own_parent(p_parent_id);
begin
  if (p_video_path is not null and p_video_path not like p.butcher_id::text || '/%')
     or (p_poster_path is not null and p_poster_path not like p.butcher_id::text || '/%') then
    raise exception 'NOT_ALLOWED';
  end if;
  perform set_config('solor.rpc', 'on', true);
  update parents set video_path = p_video_path, video_poster_path = case when p_video_path is null then null else p_poster_path end
  where id = p.id returning * into p;
  perform set_config('solor.rpc', 'off', true);
  return p;
end $$;

-- A parent that never got anything live can be thrown away (a failed start, "הקלט שוב" from scratch).
-- Its code, if it had one, is not given again.
create or replace function discard_parent(p_parent_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  p parents := own_parent(p_parent_id);
begin
  if exists (select 1 from items where parent_id = p.id and status <> 'draft') then raise exception 'INVALID_TRANSITION'; end if;
  delete from parents where id = p.id;
end $$;

-- the remainder of a parent (one only); the same row on a second call
create or replace function create_remainder(p_parent_id uuid) returns items
language plpgsql security definer set search_path = public as $$
declare
  p parents := own_parent(p_parent_id);
  i items;
begin
  if p.code is null or p.status not in ('details', 'splitting') or p.split is null then raise exception 'INVALID_TRANSITION'; end if;
  select * into i from items where parent_id = p.id and kind = 'remainder';
  if found then return i; end if;
  insert into items (parent_id, butcher_id, kind, label) values (p.id, p.butcher_id, 'remainder', p.code::text)
  returning * into i;
  return i;
end $$;

-- S3 "פורסים?": yes → units (S4); no → the whole cut is the remainder (S7). It can be changed until a unit exists
-- or the remainder went live.
create or replace function set_split(p_parent_id uuid, p_split boolean) returns parents
language plpgsql security definer set search_path = public as $$
declare
  p parents := own_parent(p_parent_id);
begin
  if p_split is null or p.code is null or p.status not in ('details', 'splitting') then raise exception 'INVALID_TRANSITION'; end if;
  if p.split is distinct from p_split then
    if exists (select 1 from items where parent_id = p.id and kind = 'unit') then raise exception 'HAS_UNITS'; end if;
    if exists (select 1 from items where parent_id = p.id and kind = 'remainder' and status <> 'draft') then
      raise exception 'INVALID_TRANSITION';
    end if;
    delete from items where parent_id = p.id and kind = 'remainder';
  end if;
  perform set_config('solor.rpc', 'on', true);
  update parents set split = p_split, status = 'splitting' where id = p.id returning * into p;
  perform set_config('solor.rpc', 'off', true);
  if not p_split then perform create_remainder(p.id); end if;
  return p;
end $$;

-- S4 "➕ יחידת מכירה חדשה": the next number, never one used before (R2/R3). Steaks default to the last unit's.
create or replace function new_unit(p_parent_id uuid) returns items
language plpgsql security definer set search_path = public as $$
declare
  p parents := own_parent(p_parent_id);
  i items;
  v_steaks int;
begin
  if p.status <> 'splitting' or p.split is not true then raise exception 'INVALID_TRANSITION'; end if;
  if exists (select 1 from items where parent_id = p.id and kind = 'remainder' and status <> 'draft') then
    raise exception 'INVALID_TRANSITION';                         -- the rest is already back on the counter
  end if;
  select steak_count into v_steaks from items where parent_id = p.id and kind = 'unit' order by unit_no desc limit 1;
  perform set_config('solor.rpc', 'on', true);
  update parents set next_unit_no = next_unit_no + 1 where id = p.id;
  perform set_config('solor.rpc', 'off', true);
  insert into items (parent_id, butcher_id, kind, unit_no, label, steak_count)
  values (p.id, p.butcher_id, 'unit', p.next_unit_no, p.code || '-' || p.next_unit_no, coalesce(v_steaks, 2))
  returning * into i;
  return i;
end $$;

-- S5 "בטל יחידה" (and dropping a draft remainder): only drafts; the number is not given back
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

-- S6/S7 "✅ אשר והעלה": confirming the photo is publishing (R8), once everything R9 asks for is there.
-- The price per kg is fixed on the item now (the parent's, unless the butcher changed it for this item, R11).
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
  update items set status = 'published', published_at = now(), sold_out_at = null,
                   price_per_kg_agorot = coalesce(i.price_per_kg_agorot, p.price_per_kg_agorot)
  where id = i.id returning * into i;
  if p.status = 'details' then update parents set status = 'splitting' where id = p.id; end if;
  perform set_config('solor.rpc', 'off', true);

  insert into stock_events (item_id, type, weight_delta_g, weight_after_g, actor_id)
  values (i.id, 'publish', i.weight_g, i.weight_g, auth.uid());
  return i;
end $$;

-- S8 "✔ סיום": nothing may be left half done (HAS_DRAFTS with the labels)
create or replace function close_parent(p_parent_id uuid, p_video_published boolean default null) returns parents
language plpgsql security definer set search_path = public as $$
declare
  p parents := own_parent(p_parent_id);
  v_drafts text;
begin
  if p.code is null then raise exception 'INVALID_TRANSITION'; end if;
  select string_agg(label, ',' order by unit_no nulls last) into v_drafts from items where parent_id = p.id and status = 'draft';
  if v_drafts is not null then raise exception 'HAS_DRAFTS' using detail = v_drafts; end if;
  perform set_config('solor.rpc', 'on', true);
  update parents set status = 'closed', closed_at = coalesce(closed_at, now()), paused_at = null,
                     video_published = coalesce(p_video_published, video_published)
  where id = p.id returning * into p;
  perform set_config('solor.rpc', 'off', true);
  return p;
end $$;

-- take a live item off sale (orders already placed stand)
create or replace function withdraw_item(p_item_id uuid) returns items
language plpgsql security definer set search_path = public as $$
declare
  i items;
begin
  select * into i from items where id = p_item_id for update;
  if not found or i.butcher_id is distinct from current_butcher_id() then raise exception 'NOT_ALLOWED'; end if;
  if i.status not in ('published', 'sold_out') then raise exception 'INVALID_TRANSITION'; end if;
  perform set_config('solor.rpc', 'on', true);
  update items set status = 'withdrawn' where id = i.id returning * into i;
  perform set_config('solor.rpc', 'off', true);
  insert into stock_events (item_id, type, weight_delta_g, weight_after_g, actor_id)
  values (i.id, 'withdraw', 0, i.weight_g, auth.uid());
  return i;
end $$;

-- S9 a sale at the counter, from the scanned label. A unit is sold. A remainder is weighed again and the new
-- balance replaces the old one (it is not subtracted, §4.4); 0 or p_sold_all = all gone.
create or replace function store_sale(p_item_id uuid, p_new_weight_g int default null, p_sold_all boolean default false)
returns items
language plpgsql security definer set search_path = public as $$
declare
  i items;
  v_old int;
  v_new int;
begin
  select * into i from items where id = p_item_id for update;
  if not found or i.butcher_id is distinct from current_butcher_id() then raise exception 'NOT_ALLOWED'; end if;
  if i.status <> 'published' then raise exception 'ITEM_NOT_AVAILABLE'; end if;
  v_old := i.weight_g;
  if i.kind = 'unit' or coalesce(p_sold_all, false) then
    v_new := case when i.kind = 'unit' then i.weight_g else 0 end;
  else
    if p_new_weight_g is null or p_new_weight_g < 0 or p_new_weight_g > 50000 then raise exception 'INVALID_WEIGHT'; end if;
    v_new := p_new_weight_g;
  end if;

  perform set_config('solor.rpc', 'on', true);
  if i.kind = 'unit' or v_new = 0 then
    update items set status = 'sold_out', sold_out_at = now(), weight_g = v_new where id = i.id returning * into i;
  else
    update items set weight_g = v_new where id = i.id returning * into i;
  end if;
  perform set_config('solor.rpc', 'off', true);

  insert into stock_events (item_id, type, weight_delta_g, weight_after_g, actor_id, reason)
  values (i.id, 'store_sale', case when i.kind = 'unit' then -v_old else v_new - v_old end, i.weight_g, auth.uid(),
          case when i.kind = 'unit' or coalesce(p_sold_all, false) then 'sold_all' end);
  return i;
end $$;

-- ───────── checkout over items ─────────
-- A cart line: {"item_id", "mode": "unit"|"remainder_all"|"remainder_slice", "requested_g", "thickness_cm"}.
-- What other customers' live holds take from an item: grams of slices, or the whole of it.
create or replace function item_held(p_item uuid, p_skip_hold uuid)
returns table (held_g int, whole boolean, any_hold boolean)
language sql stable security definer set search_path = public as $$
  select coalesce(sum(case when l.mode = 'remainder_slice' then l.requested_g else 0 end), 0)::int,
         coalesce(bool_or(l.mode <> 'remainder_slice'), false),
         count(*) > 0
  from hold_lines l join holds h on h.id = l.hold_id
  where l.item_id = p_item and h.status = 'active' and h.expires_at > now() and h.id is distinct from p_skip_hold
$$;

create or replace function line_weight(i items, p_mode line_mode, p_requested_g int) returns int
language sql immutable as $$
  select case when p_mode = 'remainder_slice' then p_requested_g else i.weight_g end
$$;

create or replace function line_total(i items, p_mode line_mode, p_requested_g int) returns int
language sql immutable set search_path = public as $$
  select price_for_weight(line_weight(i, p_mode, p_requested_g), i.price_per_kg_agorot)
$$;

-- checks the shape of the cart and locks its items in a stable order; returns the item ids
create or replace function checkout_lock(p_items jsonb) returns uuid[]
language plpgsql security definer set search_path = public as $$
declare
  v_ids uuid[];
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 30 then
    raise exception 'INVALID_CART';
  end if;
  begin
    select array_agg((e->>'item_id')::uuid) into v_ids from jsonb_array_elements(p_items) e;
  exception when others then
    raise exception 'INVALID_CART';
  end;
  if array_position(v_ids, null) is not null
     or (select count(distinct x) from unnest(v_ids) x) <> array_length(v_ids, 1) then
    raise exception 'INVALID_CART';   -- missing or duplicate item
  end if;
  perform 1 from items where id = any(v_ids) order by id for update;
  return v_ids;
end $$;

-- Every line that cannot be bought now, all at once; holds other than p_skip_hold count as taken.
-- The caller holds the item locks (checkout_lock).
create or replace function checkout_problems(p_items jsonb, p_skip_hold uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  it jsonb;
  i items;
  h record;
  v_mode line_mode;
  v_req int;
  v_thick numeric;
  v_max int;
  v_problems jsonb := '[]'::jsonb;
begin
  for it in select * from jsonb_array_elements(p_items) loop
    select * into i from items where id = (it->>'item_id')::uuid;
    if not found then
      v_problems := v_problems || jsonb_build_object('item_id', it->>'item_id', 'reason', 'ITEM_NOT_AVAILABLE');
      continue;
    end if;
    begin
      v_mode  := (it->>'mode')::line_mode;
      v_req   := nullif(it->>'requested_g', '')::int;
      v_thick := nullif(it->>'thickness_cm', '')::numeric;
    exception when others then
      raise exception 'INVALID_CART';
    end;
    if (v_mode = 'unit') <> (i.kind = 'unit') then raise exception 'INVALID_CART'; end if;
    if v_mode = 'remainder_slice' and (v_req is null or v_req < slice_min_g() or v_req % slice_step_g() <> 0
                                       or (v_thick is not null and v_thick not between 1 and 8)) then
      raise exception 'INVALID_QTY';
    end if;
    select * into h from item_held(i.id, p_skip_hold);

    if i.status <> 'published' or coalesce(i.weight_g, 0) < 1 then
      v_problems := v_problems || jsonb_build_object('item_id', i.id, 'label', i.label, 'reason', 'ITEM_NOT_AVAILABLE');
    elsif v_mode <> 'remainder_slice' then
      if h.any_hold then
        v_problems := v_problems || jsonb_build_object('item_id', i.id, 'label', i.label, 'reason', 'ITEM_RESERVED');
      end if;
    elsif h.whole then
      v_problems := v_problems || jsonb_build_object('item_id', i.id, 'label', i.label, 'reason', 'ITEM_RESERVED');
    else
      v_max := slice_max_g(i.weight_g - h.held_g);
      if v_req > v_max then
        v_problems := v_problems || jsonb_build_object('item_id', i.id, 'label', i.label,
          'reason', case when h.held_g > 0 and v_max < slice_min_g() then 'ITEM_RESERVED' else 'NOT_ENOUGH_WEIGHT' end,
          'available_g', v_max - v_max % slice_step_g());
      end if;
    end if;
  end loop;
  return v_problems;
end $$;

-- reserve_checkout: check stock and hold the whole cart, all or nothing (see 0013 for the receive/notes/contact shapes)
create or replace function reserve_checkout(p_items jsonb, p_idempotency_key uuid, p_receive jsonb default '{}'::jsonb,
                                            p_notes jsonb default '{}'::jsonb, p_contact jsonb default null)
returns holds
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  h holds;
  p profiles;
  i items;
  it jsonb;
  v_ids uuid[];
  v_bids uuid[];
  v_problems jsonb;
  v_receive jsonb;
  v_contact jsonb;
  v_items int := 0;
  v_fees int := 0;
begin
  if v_uid is null or current_role_of_user() is distinct from 'customer' then raise exception 'NOT_ALLOWED'; end if;
  if p_idempotency_key is null then raise exception 'INVALID_CART'; end if;
  if p_notes is not null and jsonb_typeof(p_notes) <> 'object' then raise exception 'INVALID_CART'; end if;
  if exists (select 1 from jsonb_each_text(coalesce(p_notes, '{}')) where char_length(value) > 300) then
    raise exception 'NOTE_TOO_LONG';
  end if;

  select * into h from holds where idempotency_key = p_idempotency_key;
  if found then
    if h.customer_id <> v_uid then raise exception 'NOT_ALLOWED'; end if;
    return h;
  end if;

  v_ids := checkout_lock(p_items);

  select * into h from holds where idempotency_key = p_idempotency_key;
  if found then
    if h.customer_id <> v_uid then raise exception 'NOT_ALLOWED'; end if;
    return h;
  end if;
  if exists (select 1 from checkouts where idempotency_key = p_idempotency_key) then raise exception 'NOT_ALLOWED'; end if;

  update holds set status = 'released', released_at = now() where customer_id = v_uid and status = 'active';

  v_problems := checkout_problems(p_items, null);
  if jsonb_array_length(v_problems) > 0 then
    raise exception 'CART_UNAVAILABLE' using detail = v_problems::text;
  end if;

  select * into p from profiles where id = v_uid;
  v_contact := jsonb_build_object(
    'name', trim(coalesce(p_contact->>'name', p.full_name)),
    'phone', coalesce(p_contact->>'phone', p.phone));
  if char_length(v_contact->>'name') not between 2 and 80 or (v_contact->>'phone') !~ '^05[0-9]-[0-9]{7}$' then
    raise exception 'INVALID_CONTACT';
  end if;

  select array_agg(distinct butcher_id) into v_bids from items where id = any(v_ids);
  v_receive := checkout_receive(v_bids, p_receive);

  for it in select * from jsonb_array_elements(p_items) loop
    select * into i from items where id = (it->>'item_id')::uuid;
    v_items := v_items + line_total(i, (it->>'mode')::line_mode, nullif(it->>'requested_g', '')::int);
  end loop;
  select coalesce(sum((value->>'fee_agorot')::int), 0) into v_fees from jsonb_each(v_receive);

  insert into holds (idempotency_key, customer_id, items, receive, notes, contact, items_agorot, fees_agorot, total_agorot, expires_at)
  values (p_idempotency_key, v_uid, p_items, v_receive, coalesce(p_notes, '{}'), v_contact, v_items, v_fees, v_items + v_fees,
          now() + make_interval(mins => checkout_hold_minutes()))
  returning * into h;

  insert into hold_lines (hold_id, item_id, mode, requested_g)
  select h.id, (e->>'item_id')::uuid, (e->>'mode')::line_mode,
         case when e->>'mode' = 'remainder_slice' then (e->>'requested_g')::int end
  from jsonb_array_elements(p_items) e;

  return h;
end $$;

-- pay_checkout: the (prototype) payment turns a hold into the purchase, once. A unit and "all of the remainder"
-- leave the counter; a slice takes its grams off the balance (R14 was checked against what was free).
create or replace function pay_checkout(p_hold_id uuid) returns checkouts
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  h holds;
  k checkouts;
  o orders;
  i items;
  it jsonb;
  rc jsonb;
  v_problems jsonb;
  v_bid uuid;
  v_note text;
  v_mode line_mode;
  v_req int;
  v_weight int;
  v_items int := 0;
begin
  if v_uid is null or current_role_of_user() is distinct from 'customer' then raise exception 'NOT_ALLOWED'; end if;

  select * into h from holds where id = p_hold_id;
  if not found or h.customer_id <> v_uid then raise exception 'NOT_ALLOWED'; end if;
  if h.checkout_id is not null then
    select * into k from checkouts where id = h.checkout_id;
    return k;
  end if;

  perform checkout_lock(h.items);
  select * into h from holds where id = p_hold_id for update;
  if h.checkout_id is not null then
    select * into k from checkouts where id = h.checkout_id;
    return k;
  end if;
  if h.status = 'released' then raise exception 'HOLD_RELEASED'; end if;

  v_problems := checkout_problems(h.items, h.id);
  if jsonb_array_length(v_problems) > 0 then
    raise exception 'CART_UNAVAILABLE' using detail = v_problems::text;
  end if;

  for it in select * from jsonb_array_elements(h.items) loop
    select * into i from items where id = (it->>'item_id')::uuid;
    v_items := v_items + line_total(i, (it->>'mode')::line_mode, nullif(it->>'requested_g', '')::int);
  end loop;
  if v_items <> h.items_agorot then raise exception 'PRICE_CHANGED'; end if;

  insert into checkouts (idempotency_key, customer_id, contact_name, contact_phone, is_demo)
  values (h.idempotency_key, v_uid, h.contact->>'name', h.contact->>'phone', true)
  returning * into k;

  for v_bid in select distinct x.butcher_id from items x
               where x.id in (select (e->>'item_id')::uuid from jsonb_array_elements(h.items) e) order by 1 loop
    v_note := nullif(trim(coalesce(h.notes->>v_bid::text, '')), '');
    rc := h.receive->(v_bid::text);
    insert into orders (checkout_id, customer_id, butcher_id, total_agorot, customer_note,
                        receive_method, delivery_address, delivery_window, delivery_fee_agorot)
    values (k.id, v_uid, v_bid, 0, v_note,
            coalesce(rc->>'method', 'pickup'), nullif(rc->'address', 'null'::jsonb), rc->>'window',
            coalesce((rc->>'fee_agorot')::int, 0))
    returning * into o;

    for it in select e from jsonb_array_elements(h.items) e
              join items x on x.id = (e->>'item_id')::uuid and x.butcher_id = v_bid loop
      select * into i from items where id = (it->>'item_id')::uuid;
      v_mode := (it->>'mode')::line_mode;
      v_req := case when v_mode = 'remainder_slice' then (it->>'requested_g')::int end;
      v_weight := line_weight(i, v_mode, v_req);

      insert into order_items (order_id, item_id, mode, requested_g, slice_thickness_cm, est_weight_g,
                               price_per_kg_agorot, total_agorot)
      values (o.id, i.id, v_mode, v_req,
              case when v_mode = 'remainder_slice' then nullif(it->>'thickness_cm', '')::numeric end,
              v_weight, i.price_per_kg_agorot, line_total(i, v_mode, v_req));

      perform set_config('solor.rpc', 'on', true);
      if v_mode = 'remainder_slice' then
        update items set weight_g = weight_g - v_weight where id = i.id returning * into i;
      else
        update items set status = 'sold_out', sold_out_at = now(),
                         weight_g = case when kind = 'remainder' then 0 else weight_g end
        where id = i.id returning * into i;
      end if;
      perform set_config('solor.rpc', 'off', true);

      insert into stock_events (item_id, type, weight_delta_g, weight_after_g, order_id, actor_id)
      values (i.id, 'order', -v_weight, i.weight_g, o.id, v_uid);
    end loop;

    update orders set total_agorot = (select sum(total_agorot) from order_items where order_id = o.id)
    where id = o.id;
    insert into order_events (order_id, from_status, to_status, actor_id) values (o.id, null, 'new', v_uid);
  end loop;

  update checkouts set total_agorot = h.total_agorot where id = k.id returning * into k;
  update holds set status = 'consumed', checkout_id = k.id where id = h.id;
  return k;
end $$;

-- hold + pay in one call
create or replace function place_checkout(p_items jsonb, p_idempotency_key uuid, p_notes jsonb default '{}'::jsonb)
returns checkouts
language plpgsql security definer set search_path = public as $$
declare
  k checkouts;
  h holds;
begin
  if auth.uid() is null or current_role_of_user() is distinct from 'customer' then raise exception 'NOT_ALLOWED'; end if;
  select * into k from checkouts where idempotency_key = p_idempotency_key;
  if found then
    if k.customer_id <> auth.uid() then raise exception 'NOT_ALLOWED'; end if;
    return k;
  end if;
  h := reserve_checkout(p_items, p_idempotency_key, '{}'::jsonb, p_notes, null);
  return pay_checkout(h.id);
end $$;

-- what other customers hold right now, for "לא זמין כרגע" and the slice limit (no customer data leaves)
create or replace function item_holds(p_ids uuid[])
returns table (item_id uuid, held_g int, whole_held boolean)
language sql stable security definer set search_path = public as $$
  select l.item_id,
         coalesce(sum(case when l.mode = 'remainder_slice' then l.requested_g else 0 end), 0)::int,
         coalesce(bool_or(l.mode <> 'remainder_slice'), false)
  from hold_lines l join holds h on h.id = l.hold_id
  where l.item_id = any(p_ids[1:80]) and h.status = 'active' and h.expires_at > now()
    and h.customer_id is distinct from auth.uid()
  group by l.item_id
$$;

-- ───────── cancellations return the meat ─────────
-- A unit is back on sale; a remainder gets its grams back. A withdrawn item stays withdrawn.
-- The caller holds the item lock.
create or replace function return_item_stock(l order_items, p_actor uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare
  i items;
  v_delta int;
begin
  select * into i from items where id = l.item_id;
  if i.status not in ('published', 'sold_out') then return; end if;
  v_delta := case when i.kind = 'unit' then 0 else l.est_weight_g end;
  if i.kind = 'unit' and i.status <> 'sold_out' then return; end if;

  perform set_config('solor.rpc', 'on', true);
  update items set weight_g = least(50000, weight_g + v_delta), status = 'published', sold_out_at = null
  where id = i.id returning * into i;
  perform set_config('solor.rpc', 'off', true);

  insert into stock_events (item_id, type, weight_delta_g, weight_after_g, order_id, actor_id, reason)
  values (i.id, 'order_cancel', case when i.kind = 'unit' then i.weight_g else v_delta end, i.weight_g, l.order_id, p_actor, p_reason);
end $$;

-- customer: own order while 'new'. butcher: own shop before completed, with a reason.
create or replace function cancel_order(p_order_id uuid, p_reason text default null) returns orders
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role user_role := current_role_of_user();
  v_bid uuid := current_butcher_id();
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  o orders;
  l order_items;
  v_from order_status;
begin
  if v_uid is null or v_role is null then raise exception 'NOT_ALLOWED'; end if;
  select * into o from orders where id = p_order_id for update;
  if not found then raise exception 'NOT_ALLOWED'; end if;
  if v_role = 'customer' then
    if o.customer_id <> v_uid then raise exception 'NOT_ALLOWED'; end if;
    if o.status <> 'new' then raise exception 'INVALID_TRANSITION'; end if;
  else
    if o.butcher_id is distinct from v_bid then raise exception 'NOT_ALLOWED'; end if;
    if o.status in ('completed', 'cancelled') then raise exception 'INVALID_TRANSITION'; end if;
    if v_reason is null then raise exception 'REASON_REQUIRED'; end if;
  end if;

  perform 1 from items where id in (select item_id from order_items where order_id = o.id) order by id for update;

  for l in select * from order_items where order_id = o.id and status = 'active' loop
    update order_items set status = 'cancelled', cancel_reason = v_reason, cancelled_by = v_role,
                           cancelled_at = now(), restocked = true
    where id = l.id;
    perform return_item_stock(l, v_uid, v_reason);
  end loop;

  v_from := o.status;
  update orders set status = 'cancelled', cancel_reason = v_reason, cancelled_by = v_role
  where id = o.id returning * into o;
  insert into order_events (order_id, from_status, to_status, actor_id, note) values (o.id, v_from, 'cancelled', v_uid, v_reason);
  return o;
end $$;

-- one line: the customer while 'new' (always back to stock); the butcher with a reason, choosing whether the meat
-- goes back on sale. The last active line cancels the order.
create or replace function cancel_order_item(p_item_id uuid, p_reason text default null, p_restock boolean default true)
returns orders
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role user_role := current_role_of_user();
  v_bid uuid := current_butcher_id();
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_restock boolean;
  l order_items;
  o orders;
  v_from order_status;
begin
  if v_uid is null or v_role is null then raise exception 'NOT_ALLOWED'; end if;
  select * into l from order_items where id = p_item_id;
  if not found then raise exception 'NOT_ALLOWED'; end if;
  select * into o from orders where id = l.order_id for update;

  if v_role = 'customer' then
    if o.customer_id <> v_uid then raise exception 'NOT_ALLOWED'; end if;
    if o.status <> 'new' then raise exception 'INVALID_TRANSITION'; end if;
    v_restock := true;
  else
    if o.butcher_id is distinct from v_bid then raise exception 'NOT_ALLOWED'; end if;
    if o.status in ('completed', 'cancelled') then raise exception 'INVALID_TRANSITION'; end if;
    if v_reason is null then raise exception 'REASON_REQUIRED'; end if;
    v_restock := coalesce(p_restock, true);
  end if;

  perform 1 from items where id = l.item_id for update;
  select * into l from order_items where id = p_item_id;
  if l.status <> 'active' then raise exception 'INVALID_TRANSITION'; end if;

  update order_items set status = 'cancelled', cancel_reason = v_reason, cancelled_by = v_role,
                         cancelled_at = now(), restocked = v_restock
  where id = l.id;
  if v_restock then perform return_item_stock(l, v_uid, v_reason); end if;

  if exists (select 1 from order_items where order_id = o.id and status = 'active') then
    update orders set total_agorot = (select sum(total_agorot) from order_items where order_id = o.id and status = 'active')
    where id = o.id returning * into o;
  else
    v_from := o.status;
    update orders set status = 'cancelled', cancel_reason = v_reason, cancelled_by = v_role
    where id = o.id returning * into o;
    insert into order_events (order_id, from_status, to_status, actor_id, note) values (o.id, v_from, 'cancelled', v_uid, v_reason);
  end if;
  return o;
end $$;

-- ───────── RLS + grants ─────────
alter table parents enable row level security;
alter table items   enable row level security;
revoke all on parents, items from anon, authenticated;

grant select on parents, items to anon, authenticated;
grant update (cut_type, breed_key, breed_other, origin_country, is_aged, aging_days, aging_method, butcher_marbling,
              description, price_per_kg_agorot, video_published) on parents to authenticated;
grant update (steak_count, weight_g, price_per_kg_agorot, weight_source) on items to authenticated;
grant update (scale_barcode_config) on butchers to authenticated;

create policy items_select_public on items for select to anon, authenticated
  using (item_is_public(status, published_at));
create policy items_select_own on items for select to authenticated using (butcher_id = current_butcher_id());
create policy items_update_own on items for update to authenticated
  using (butcher_id = current_butcher_id()) with check (butcher_id = current_butcher_id());

create policy parents_select_public on parents for select to anon, authenticated
  using (exists (select 1 from items i where i.parent_id = parents.id and item_is_public(i.status, i.published_at)));
create policy parents_select_own on parents for select to authenticated using (butcher_id = current_butcher_id());
create policy parents_update_own on parents for update to authenticated
  using (butcher_id = current_butcher_id()) with check (butcher_id = current_butcher_id());

-- cut_media: photos of items (the old cut-based policies are removed in 0017; they never match an item's row)
revoke all on cut_media from anon, authenticated;
grant select on cut_media to anon, authenticated;
grant insert (item_id, type, storage_path, thumb_path, poster_path, is_cover, sort_order, width, height, duration_s)
  on cut_media to authenticated;
grant update (is_cover, sort_order, poster_path) on cut_media to authenticated;
grant delete on cut_media to authenticated;
create policy cut_media_select_public on cut_media for select to anon, authenticated
  using (exists (select 1 from items i where i.id = cut_media.item_id and item_is_public(i.status, i.published_at)));
create policy cut_media_select_own on cut_media for select to authenticated
  using (exists (select 1 from items i where i.id = cut_media.item_id and i.butcher_id = current_butcher_id()));
create policy cut_media_manage_own_items on cut_media for all to authenticated
  using (exists (select 1 from items i where i.id = cut_media.item_id and i.butcher_id = current_butcher_id()))
  with check (exists (select 1 from items i where i.id = cut_media.item_id and i.butcher_id = current_butcher_id()
                      and i.status = 'draft'));

create policy stock_events_select_own_items on stock_events for select to authenticated
  using (exists (select 1 from items i where i.id = stock_events.item_id and i.butcher_id = current_butcher_id()));

alter table hold_lines enable row level security;
revoke all on hold_lines from anon, authenticated;

revoke execute on function
  slice_min_g(), slice_step_g(), slice_max_g(int), item_is_public(cut_status, timestamptz), parent_missing_fields(parents),
  item_missing_fields(items, parents), item_has_active_orders(uuid), own_parent(uuid), parents_guard_update(),
  items_guard_update(), cut_media_guard_delete(), item_held(uuid, uuid), line_weight(items, line_mode, int),
  line_total(items, line_mode, int), checkout_lock(jsonb), checkout_problems(jsonb, uuid), return_item_stock(order_items, uuid, text),
  start_parent(boolean), resume_parent(uuid), stop_recording(uuid, text), set_parent_video(uuid, text, text),
  discard_parent(uuid), create_remainder(uuid), set_split(uuid, boolean), new_unit(uuid), cancel_unit(uuid),
  publish_item(uuid), close_parent(uuid, boolean), withdraw_item(uuid), store_sale(uuid, int, boolean),
  reserve_checkout(jsonb, uuid, jsonb, jsonb, jsonb), pay_checkout(uuid), place_checkout(jsonb, uuid, jsonb),
  item_holds(uuid[]), cancel_order(uuid, text), cancel_order_item(uuid, text, boolean)
from public, anon, authenticated;
-- used inside RLS policies, evaluated as the caller
grant execute on function item_is_public(cut_status, timestamptz) to anon, authenticated;
grant execute on function
  start_parent(boolean), resume_parent(uuid), stop_recording(uuid, text), set_parent_video(uuid, text, text),
  discard_parent(uuid), create_remainder(uuid), set_split(uuid, boolean), new_unit(uuid), cancel_unit(uuid),
  publish_item(uuid), close_parent(uuid, boolean), withdraw_item(uuid), store_sale(uuid, int, boolean),
  reserve_checkout(jsonb, uuid, jsonb, jsonb, jsonb), pay_checkout(uuid), place_checkout(jsonb, uuid, jsonb),
  cancel_order(uuid, text), cancel_order_item(uuid, text, boolean)
to authenticated;
grant execute on function item_holds(uuid[]) to anon, authenticated;
grant execute on function slice_min_g(), slice_step_g(), slice_max_g(int) to anon, authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table parents, items;
  end if;
end $$;
