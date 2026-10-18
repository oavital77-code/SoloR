-- remove_cut (0010): delete a cut that never sold, archive one with order lines, never a live one.
\set ON_ERROR_STOP 1
create or replace function pg_temp.check(p_ok boolean, p_msg text) returns void
language plpgsql as $$ begin if not coalesce(p_ok, false) then raise exception 'ASSERTION FAILED: %', p_msg; end if; end $$;
grant execute on function pg_temp.check(boolean, text) to authenticated;
create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void
language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then if sqlerrm = p_code or sqlstate = p_code then return; end if;
    raise exception 'expected % but got %: %', p_code, sqlerrm, p_sql;
  end;
  raise exception 'expected % but statement succeeded: %', p_code, p_sql;
end $$;
grant execute on function pg_temp.expect_error(text, text) to authenticated;

-- fixtures (superuser): a withdrawn cut with a photo and a stock event, never ordered;
-- a cut of the same shop that has order lines, now sold out; a cut of the other shop
insert into cuts (butcher_id, status, cut_type) values ('00000000-0000-4000-8000-000000000001', 'withdrawn', 'entrecote');
select set_config('t.free', (select id::text from cuts order by created_at desc, code desc limit 1), false);
insert into cut_media (cut_id, type, storage_path, is_cover, sort_order)
values (current_setting('t.free')::uuid, 'photo', 'x/y/z.jpg', true, 0);
insert into stock_events (cut_id, type, steaks_delta, whole_after, reason) values (current_setting('t.free')::uuid, 'publish', 0, false, 'test');
select set_config('t.sold', (select i.cut_id::text from order_items i join cuts c on c.id = i.cut_id
  where c.butcher_id = '00000000-0000-4000-8000-000000000001' limit 1), false);
select set_config('solor.rpc', 'on', false);
update cuts set status = 'sold_out' where id = current_setting('t.sold')::uuid;
select set_config('solor.rpc', '', false);
select set_config('t.live', (select id::text from cuts where status = 'published' and butcher_id = '00000000-0000-4000-8000-000000000001' limit 1), false);
select set_config('t.other', (select id::text from cuts where butcher_id = '00000000-0000-4000-8000-000000000002' limit 1), false);
select pg_temp.check(current_setting('t.sold') <> '' and current_setting('t.live') <> '' and current_setting('t.other') <> '', 'fixtures found');

set role authenticated;
set request.jwt.claim.sub = '10000000-0000-4000-8000-0000000000c1';
select pg_temp.expect_error(format('select remove_cut(%L)', current_setting('t.free')), 'NOT_ALLOWED');

set request.jwt.claim.sub = '10000000-0000-4000-8000-00000000000b';
select pg_temp.expect_error(format('select remove_cut(%L)', current_setting('t.other')), 'NOT_ALLOWED');
select pg_temp.expect_error(format('select remove_cut(%L)', current_setting('t.live')), 'INVALID_TRANSITION');
select pg_temp.check(remove_cut(current_setting('t.free')::uuid) = 'deleted', 'never-ordered cut is deleted');
select pg_temp.check(remove_cut(current_setting('t.sold')::uuid) = 'archived', 'cut with order lines is archived');
reset role;

select pg_temp.check(not exists (select 1 from cuts where id = current_setting('t.free')::uuid), 'row gone');
select pg_temp.check(not exists (select 1 from cut_media where cut_id = current_setting('t.free')::uuid), 'media rows gone');
select pg_temp.check(not exists (select 1 from stock_events where cut_id = current_setting('t.free')::uuid), 'stock events gone');
select pg_temp.check((select archived_at is not null and status = 'sold_out' from cuts where id = current_setting('t.sold')::uuid), 'archived, status kept');
select pg_temp.check(exists (select 1 from order_items where cut_id = current_setting('t.sold')::uuid), 'its order lines kept');
\echo 'Remove cut tests passed'

-- ═════════ carts (0012): each customer reads and writes only their own ═════════
set role authenticated;
set request.jwt.claim.sub = '10000000-0000-4000-8000-0000000000c1';
insert into carts (user_id, lines) values ('10000000-0000-4000-8000-0000000000c1', '[{"cutId":"x"}]');
set request.jwt.claim.sub = '10000000-0000-4000-8000-0000000000c2';
select pg_temp.check((select count(*) from carts) = 0, 'another customer sees no cart');
select pg_temp.expect_error($$insert into carts (user_id, lines) values ('10000000-0000-4000-8000-0000000000c1', '[]')$$, '42501');
update carts set lines = '[]' where user_id = '10000000-0000-4000-8000-0000000000c1';
reset role;
select pg_temp.check((select jsonb_array_length(lines) from carts where user_id = '10000000-0000-4000-8000-0000000000c1') = 1, 'cart untouched by others');
\echo 'Cart tests passed'
