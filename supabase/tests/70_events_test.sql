-- Events (0015): the app can only append through log_events; nobody reads them from the app.
\set ON_ERROR_STOP 1
create or replace function pg_temp.check(p_ok boolean, p_msg text) returns void
language plpgsql as $$ begin if not coalesce(p_ok, false) then raise exception 'ASSERTION FAILED: %', p_msg; end if; end $$;
grant execute on function pg_temp.check(boolean, text) to anon, authenticated;
create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void
language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then if sqlerrm = p_code or sqlstate = p_code then return; end if;
    raise exception 'expected % but got %: %', p_code, sqlerrm, p_sql;
  end;
  raise exception 'expected % but statement succeeded: %', p_code, p_sql;
end $$;
grant execute on function pg_temp.expect_error(text, text) to anon, authenticated;

set role anon;
select pg_temp.check(log_events('[{"name":"app_open","viewer":"device-0001","session":"session-01","props":{"is_guest":true}}]') = 1, 'guest logs');
select pg_temp.expect_error($$select log_events('[{"name":"hack","viewer":"device-0001","session":"session-01"}]')$$, '23514');
select pg_temp.expect_error('select * from events', '42501');
set role authenticated;
set request.jwt.claim.sub = '10000000-0000-4000-8000-0000000000c1';
select pg_temp.check(log_events('[{"name":"post_impression","viewer":"device-0001","session":"session-01","props":{"dwell_ms":6000}},
  {"name":"add_to_cart","viewer":"device-0001","session":"session-01","props":{"price":1000}}]') = 2, 'signed in logs a batch');
select pg_temp.expect_error('select * from events', '42501');
reset role;
select pg_temp.check((select user_id is null from events where name = 'app_open'), 'guest has no user');
select pg_temp.check((select user_id = '10000000-0000-4000-8000-0000000000c1' from events where name = 'add_to_cart'), 'user filled by the server');
select pg_temp.check((select sessions = 1 and add_to_cart_per_100_views = 100 from pilot_daily limit 1), 'daily view adds up');
\echo 'Events tests passed'
