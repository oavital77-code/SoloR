-- SoloR prototype — RLS and privileges (SPEC §7.5)
-- Principle: deny by default, grant only the columns each role may write.

alter table profiles     enable row level security;
alter table butchers     enable row level security;
alter table breeds       enable row level security;
alter table cuts         enable row level security;
alter table cut_media    enable row level security;
alter table orders       enable row level security;
alter table order_events enable row level security;
alter table stock_events enable row level security;

-- Reset Supabase's default broad grants
revoke all on profiles, butchers, breeds, cuts, cut_media, orders, order_events, stock_events from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- ───────── profiles ─────────
grant select on profiles to authenticated;
grant insert (id, full_name, phone) on profiles to authenticated;   -- role/butcher_id never from client
grant update (full_name, phone)     on profiles to authenticated;

create policy profiles_select_self on profiles for select to authenticated
  using (id = auth.uid());

-- butcher reads name/phone of customers who ordered from them
create policy profiles_select_customers_of_butcher on profiles for select to authenticated
  using (exists (select 1 from orders o where o.customer_id = profiles.id and o.butcher_id = current_butcher_id()));

create policy profiles_insert_self on profiles for insert to authenticated
  with check (id = auth.uid());

create policy profiles_update_self on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- ───────── butchers ─────────
grant select on butchers to authenticated;
grant update (name, address, phone, pickup_hours, logo_path) on butchers to authenticated;

create policy butchers_select on butchers for select to authenticated using (true);
create policy butchers_update_own on butchers for update to authenticated
  using (id = current_butcher_id()) with check (id = current_butcher_id());

-- ───────── breeds ─────────
grant select on breeds to authenticated;
create policy breeds_select on breeds for select to authenticated using (true);

-- ───────── cuts ─────────
grant select on cuts to authenticated;
grant insert (
  butcher_id,
  cut_type, breed_key, breed_other, origin_country, is_aged, aging_days, aging_method,
  butcher_marbling, description, weight_g, price_per_kg_agorot, sale_mode,
  steak_weight_g, steak_thickness_cm, steaks_planned
) on cuts to authenticated;                          -- new rows are always drafts (status default)
grant update (
  cut_type, breed_key, breed_other, origin_country, is_aged, aging_days, aging_method,
  butcher_marbling, description, weight_g, price_per_kg_agorot, sale_mode,
  steak_weight_g, steak_thickness_cm, steaks_planned
) on cuts to authenticated;                          -- never status / stock columns
grant delete on cuts to authenticated;

-- Customers see live cuts. 'withdrawn' rows that were once published are readable too, so that
-- Realtime can deliver the withdraw event and the feed removes the card live (see OPEN_QUESTIONS.md).
create policy cuts_select_visible on cuts for select to authenticated
  using (status in ('published','sold_out') or (status = 'withdrawn' and published_at is not null));

create policy cuts_select_own on cuts for select to authenticated
  using (butcher_id = current_butcher_id());

create policy cuts_insert_own on cuts for insert to authenticated
  with check (butcher_id = current_butcher_id());

create policy cuts_update_own on cuts for update to authenticated
  using (butcher_id = current_butcher_id()) with check (butcher_id = current_butcher_id());

create policy cuts_delete_own_draft on cuts for delete to authenticated
  using (butcher_id = current_butcher_id() and status = 'draft');

-- ───────── cut_media ─────────
grant select on cut_media to authenticated;
grant insert (cut_id, type, storage_path, thumb_path, poster_path, is_cover, sort_order, width, height, duration_s)
  on cut_media to authenticated;
grant update (is_cover, sort_order, poster_path) on cut_media to authenticated;
grant delete on cut_media to authenticated;

create policy cut_media_select_visible on cut_media for select to authenticated
  using (exists (select 1 from cuts c where c.id = cut_media.cut_id
                 and (c.status in ('published','sold_out')
                      or (c.status = 'withdrawn' and c.published_at is not null)
                      or c.butcher_id = current_butcher_id())));

create policy cut_media_manage_own on cut_media for all to authenticated
  using (exists (select 1 from cuts c where c.id = cut_media.cut_id and c.butcher_id = current_butcher_id()))
  with check (exists (select 1 from cuts c where c.id = cut_media.cut_id and c.butcher_id = current_butcher_id()
                      and c.status <> 'withdrawn'));

-- ───────── orders (read-only from client; writes via RPC) ─────────
grant select on orders to authenticated;

create policy orders_select_customer on orders for select to authenticated
  using (customer_id = auth.uid());
create policy orders_select_butcher on orders for select to authenticated
  using (butcher_id = current_butcher_id());

-- ───────── order_events ─────────
grant select on order_events to authenticated;

create policy order_events_select on order_events for select to authenticated
  using (exists (select 1 from orders o where o.id = order_events.order_id
                 and (o.customer_id = auth.uid() or o.butcher_id = current_butcher_id())));

-- ───────── stock_events (butcher only) ─────────
grant select on stock_events to authenticated;

create policy stock_events_select_butcher on stock_events for select to authenticated
  using (exists (select 1 from cuts c where c.id = stock_events.cut_id and c.butcher_id = current_butcher_id()));

-- ───────── functions ─────────
revoke execute on all functions in schema public from public, anon;
grant execute on function
  publish_cut(uuid),
  revert_to_draft(uuid),
  place_order(uuid, order_mode, int, uuid, text),
  cancel_order(uuid, text),
  advance_order(uuid, order_status),
  store_sale(uuid, int, boolean),
  withdraw_cut(uuid),
  current_butcher_id(),
  current_role_of_user(),
  cut_has_active_orders(uuid)
to authenticated;
-- helpers used inside RLS policies / triggers
grant execute on function price_for_weight(int, int), max_steaks(int, int) to authenticated;

-- cuts.code default uses the sequence on insert
grant usage on sequence cut_code_seq to authenticated;
