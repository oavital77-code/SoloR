-- "🗑 מחק נתח" at any step (founders, 22.10.2026). A cut nothing of which ever went live is thrown away with its
-- drafts and photos (discard_parent). A cut with something live or sold: its drafts go, what is on sale comes off
-- the showcase (withdrawn, kept for the history and the orders), and it is closed — its clip is free again. Not while
-- an order on it is open: the butcher finishes or cancels it first.
create or replace function remove_parent(p_parent_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  p parents := own_parent(p_parent_id);
  v_item uuid;
begin
  if not exists (select 1 from items where parent_id = p.id and status <> 'draft') then
    perform discard_parent(p.id);
    return 'discarded';
  end if;
  if exists (select 1 from items i where i.parent_id = p.id and item_has_active_orders(i.id)) then
    raise exception 'HAS_ACTIVE_ORDERS';
  end if;
  for v_item in select id from items where parent_id = p.id and status = 'draft' loop
    perform cancel_unit(v_item);
  end loop;
  for v_item in select id from items where parent_id = p.id and status = 'published' loop
    perform withdraw_item(v_item);
  end loop;
  perform close_parent(p.id, false);
  return 'closed';
end $$;

revoke execute on function remove_parent(uuid) from public, anon, authenticated;
grant execute on function remove_parent(uuid) to authenticated;
