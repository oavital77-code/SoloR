-- Stage 1 (review 14.10.2026): marketplace + guest browsing.
-- Butchers get display fields; guests (anon) can read the public catalogue — never profiles, orders or events.

alter table butchers
  add column slug        text unique,
  add column city        text,
  add column description text check (char_length(description) <= 300),
  add column is_test     boolean not null default false;   -- test shops (shown with a badge)

update butchers set slug = 'butcher-' || substr(id::text, 36, 1) where slug is null;
alter table butchers alter column slug set not null;
alter table butchers add constraint butchers_slug_format check (slug ~ '^[a-z0-9-]{2,40}$');

grant update (city, description) on butchers to authenticated;

-- ───────── guest (anon) read access to the public catalogue ─────────
grant select on butchers, breeds, cuts, cut_media to anon;

create policy butchers_select_anon on butchers for select to anon using (true);
create policy breeds_select_anon on breeds for select to anon using (true);
create policy cuts_select_anon on cuts for select to anon
  using (status in ('published','sold_out') or (status = 'withdrawn' and published_at is not null));
create policy cut_media_select_anon on cut_media for select to anon
  using (exists (select 1 from cuts c where c.id = cut_media.cut_id
                 and (c.status in ('published','sold_out') or (c.status = 'withdrawn' and c.published_at is not null))));
