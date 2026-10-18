-- Shop page fields (customer spec §7.1, §14 Butcher). Filled by the butcher's onboarding questionnaire
-- (butcher side, specified separately); the shop page shows only what is filled.
-- opening_hours: Israel local time, day "0" = Sunday … "6" = Saturday, each a list of ["HH:MM","HH:MM"] ranges;
-- a missing day is closed. pickup_hours (free text) stays as the fallback until opening_hours is filled.

alter table butchers
  add column if not exists cover_path       text,
  add column if not exists specialty        text check (char_length(specialty) <= 120),
  add column if not exists opening_hours    jsonb,
  add column if not exists suppliers        text[] not null default '{}',
  add column if not exists sources          text[] not null default '{}',
  add column if not exists pickup_enabled   boolean not null default true,
  add column if not exists delivery_enabled boolean not null default false,
  add column if not exists delivery_areas   text[] not null default '{}',
  add column if not exists status           text not null default 'active' check (status in ('active', 'inactive'));

grant update (cover_path, specialty, opening_hours, suppliers, sources, pickup_enabled, delivery_enabled, delivery_areas)
  on butchers to authenticated;
