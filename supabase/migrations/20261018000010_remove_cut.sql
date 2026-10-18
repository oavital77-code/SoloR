-- "מחק" on a cut in the butcher's list (founders' request): clears out drafts and old cuts that are no
-- longer relevant. A cut that never had an order line is deleted for good (its media rows and stock
-- events go with it). A cut with order lines keeps them — the orders still point at it — and is only
-- hidden from the butcher's list (archived_at). Cuts that are live must be taken off sale first.

alter table cuts add column if not exists archived_at timestamptz;

create or replace function remove_cut(p_cut_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  c cuts;
begin
  select * into c from cuts where id = p_cut_id for update;
  if not found or c.butcher_id is distinct from current_butcher_id() then
    raise exception 'NOT_ALLOWED';
  end if;
  if c.status = 'published' then
    raise exception 'INVALID_TRANSITION';
  end if;

  if not exists (select 1 from order_items i where i.cut_id = c.id) then
    delete from cuts where id = c.id;
    return 'deleted';
  end if;

  perform set_config('solor.rpc', 'on', true);
  update cuts set archived_at = now() where id = c.id;
  return 'archived';
end $$;

revoke all on function remove_cut(uuid) from public, anon;
grant execute on function remove_cut(uuid) to authenticated;
