-- Pilot measurement (customer spec §15, step 10): the app's events, written in small batches and read only by
-- the founders (SQL editor / the views below). Nothing here is shown in the app.
--
--   viewer   a random id kept on the device (guests too; how to identify a guest is still open, §18.6)
--   session  a random id per visit (a new one after 30 minutes away)
--   user_id  the signed-in account, filled by the server — never trusted from the client
--   props    the event's fields as listed in §15 (small JSON; the app sends no personal details)

create table if not exists events (
  id         bigint generated always as identity primary key,
  name       text not null check (name in (
               'app_open', 'post_impression', 'media_swipe', 'video_play', 'new_posts_pill_click',
               'butcher_page_view', 'search_submit', 'search_result_click', 'add_to_cart', 'cart_view',
               'checkout_start', 'auth_complete', 'reservation_failed', 'payment_success', 'payment_failed')),
  viewer     text not null check (char_length(viewer) between 8 and 64),
  session    text not null check (char_length(session) between 8 and 64),
  user_id    uuid,
  props      jsonb not null default '{}' check (jsonb_typeof(props) = 'object' and pg_column_size(props) <= 2000),
  at         timestamptz not null default now()
);
create index if not exists events_name_at on events (name, at);
create index if not exists events_session on events (session);

alter table events enable row level security;
revoke all on events from anon, authenticated;            -- no direct reads or writes from the app

-- One batch from the app (up to 50 events). The client's clock is ignored; unknown names fail the whole batch.
create or replace function log_events(p_events jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  if p_events is null or jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) > 50 then
    raise exception 'INVALID_EVENTS';
  end if;
  insert into events (name, viewer, session, user_id, props)
  select e->>'name', e->>'viewer', e->>'session', auth.uid(), coalesce(e->'props', '{}')
  from jsonb_array_elements(p_events) e;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function log_events(jsonb) from public;
grant execute on function log_events(jsonb) to anon, authenticated;

-- ───────── the pilot's measures (§15), per day, Israel time ─────────
create or replace view pilot_daily with (security_invoker = true) as
with s as (
  select session, min(at) as started, max(at) as ended,
         count(*) filter (where name = 'post_impression') as impressions,
         count(*) filter (where name = 'add_to_cart') as adds,
         bool_or(name = 'checkout_start') as checkout,
         bool_or(name = 'payment_success') as paid
  from events group by session
)
select (started at time zone 'Asia/Jerusalem')::date as day,
       count(*)                                                        as sessions,
       round(avg(extract(epoch from ended - started)) / 60, 1)         as avg_session_minutes,
       round(avg(impressions), 1)                                      as posts_viewed_per_session,
       round(100.0 * sum(adds) / nullif(sum(impressions), 0), 1)       as add_to_cart_per_100_views,
       count(*) filter (where checkout)                                as sessions_with_checkout,
       round(100.0 * count(*) filter (where paid) / nullif(count(*) filter (where checkout), 0), 1) as checkout_to_payment_pct
from s group by 1 order by 1 desc;

-- items per order (§15): from the orders themselves
create or replace view pilot_items_per_order with (security_invoker = true) as
select (k.created_at at time zone 'Asia/Jerusalem')::date as day,
       count(distinct k.id) as purchases,
       round(count(i.id)::numeric / nullif(count(distinct k.id), 0), 2) as items_per_purchase
from checkouts k join orders o on o.checkout_id = k.id join order_items i on i.order_id = o.id
group by 1 order by 1 desc;

revoke all on pilot_daily, pilot_items_per_order from anon, authenticated;
