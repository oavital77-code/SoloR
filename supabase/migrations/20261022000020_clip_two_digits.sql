-- Founders, 22.10.2026: the parent's number is written with two digits — cut "09", its trays "09-01", "09-02" — and
-- any single tray (or the block) can be taken away at any time, a draft too.

-- "09", "15", "123"
create or replace function clip_label(p_code int) returns text
language sql immutable as $$ select lpad(p_code::text, greatest(2, length(p_code::text)), '0') $$;

-- "09-01"
create or replace function unit_label(p_code int, p_unit_no int) returns text
language sql immutable as $$ select clip_label(p_code) || '-' || lpad(p_unit_no::text, 2, '0') $$;

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
  update items set label = case when kind = 'unit' then unit_label(p_code, unit_no) else clip_label(p_code) end
  where parent_id = p.id and label is not null;
  perform set_config('solor.rpc', 'off', true);
  return p;
end $$;

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
    update items set label = clip_label(p.code) where id = i.id;
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

-- "🗑" on a tray or the block: a draft is thrown away (it had no number yet); one live or sold comes off the showcase
-- (withdrawn, kept for the history and the orders) — not while an order on it is open.
create or replace function remove_item(p_item_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  i items;
begin
  select * into i from items where id = p_item_id;
  if not found or i.butcher_id is distinct from current_butcher_id() then raise exception 'NOT_ALLOWED'; end if;
  if i.status = 'draft' then
    perform cancel_unit(i.id);
    return 'discarded';
  end if;
  if i.status = 'withdrawn' then return 'withdrawn'; end if;
  if item_has_active_orders(i.id) then raise exception 'HAS_ACTIVE_ORDERS'; end if;
  perform withdraw_item(i.id);
  return 'withdrawn';
end $$;

-- what is already numbered is written the same way
select set_config('solor.rpc', 'on', true);
update items i set label = case when i.kind = 'unit' then unit_label(p.code, i.unit_no) else clip_label(p.code) end
from parents p
where p.id = i.parent_id and p.code is not null and i.label is not null and (i.kind = 'remainder' or i.unit_no is not null)
  and i.label is distinct from case when i.kind = 'unit' then unit_label(p.code, i.unit_no) else clip_label(p.code) end;
select set_config('solor.rpc', 'off', true);

revoke execute on function clip_label(int), remove_item(uuid) from public, anon, authenticated;
grant execute on function remove_item(uuid) to authenticated;
