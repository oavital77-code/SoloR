-- SoloR prototype — schema (SPEC §7.3)
-- Technical additions (allowed by spec): cuts.steaks_planned, cuts.sold_out_at, cut_media.thumb_path

create extension if not exists pgcrypto;

-- ENUMS
create type user_role        as enum ('customer', 'butcher');
create type cut_type         as enum ('sinta','entrecote','ontrib','asado','picanha','shaitel','denver');
create type origin_country   as enum ('IL','AR','UY','PY','JP','AU');
create type aging_method     as enum ('dry','wet');
create type sale_mode        as enum ('whole','steaks','both');
create type cut_status       as enum ('draft','published','sold_out','withdrawn');
create type media_type       as enum ('photo','video');
create type order_mode       as enum ('whole','steaks');
create type order_status     as enum ('new','preparing','ready','completed','cancelled');
create type stock_event_type as enum ('publish','order','order_cancel','store_sale','manual_adjust','withdraw');

-- BUTCHERS
create table butchers (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  address      text not null,
  phone        text not null,
  pickup_hours text,
  logo_path    text,
  created_at   timestamptz not null default now()
);

-- PROFILES (1:1 with auth.users)
create table profiles (
  id          uuid primary key references auth.users on delete cascade,
  role        user_role not null default 'customer',
  full_name   text not null check (char_length(trim(full_name)) between 2 and 80),
  phone       text not null check (phone ~ '^05[0-9]-[0-9]{7}$'),
  butcher_id  uuid references butchers(id),
  created_at  timestamptz not null default now()
);

-- BREEDS (editable list)
create table breeds (
  key         text primary key,
  label_he    text not null,
  applies_to  cut_type[] not null default '{}',
  sort_order  int not null default 0,
  active      boolean not null default true
);

-- CUTS
create sequence cut_code_seq;
create table cuts (
  id                    uuid primary key default gen_random_uuid(),
  code                  text unique not null default ('SOL-' || lpad(nextval('cut_code_seq')::text, 4, '0')),
  butcher_id            uuid not null references butchers(id),
  status                cut_status not null default 'draft',

  cut_type              cut_type,
  breed_key             text references breeds(key),
  breed_other           text check (char_length(breed_other) <= 60),
  origin_country        origin_country,
  is_aged               boolean,
  aging_days            int check (aging_days between 1 and 365),
  aging_method          aging_method,
  butcher_marbling      smallint check (butcher_marbling between 1 and 10),
  description           text check (char_length(description) <= 500),

  weight_g              int check (weight_g between 100 and 20000),
  price_per_kg_agorot   int check (price_per_kg_agorot between 100 and 500000),

  sale_mode             sale_mode,
  steak_weight_g        int check (steak_weight_g between 150 and 1000 and steak_weight_g % 10 = 0),
  steak_thickness_cm    numeric(3,1) check (steak_thickness_cm between 1 and 8),
  -- technical: number of steaks the butcher chose (null = max computed). Only lowers the max.
  steaks_planned        int check (steaks_planned >= 1),
  steaks_total          int not null default 0,
  steaks_available      int not null default 0 check (steaks_available >= 0),
  whole_available       boolean not null default false,

  published_at          timestamptz,
  sold_out_at           timestamptz,           -- technical: for the 6h "sold out" tail of the feed
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  check (steaks_available <= steaks_total)
);
create index on cuts (status, published_at desc);
create index on cuts (butcher_id, status);

-- CUT MEDIA
create table cut_media (
  id            uuid primary key default gen_random_uuid(),
  cut_id        uuid not null references cuts(id) on delete cascade,
  type          media_type not null,
  storage_path  text not null,
  thumb_path    text,                       -- technical: small image for grids/thumbnails
  poster_path   text,
  is_cover      boolean not null default false,
  sort_order    int not null default 0,
  width         int, height int, duration_s numeric,
  created_at    timestamptz not null default now()
);
create index on cut_media (cut_id, sort_order);

-- ORDERS
create sequence order_number_seq start 1001;
create table orders (
  id                    uuid primary key default gen_random_uuid(),
  order_number          int unique not null default nextval('order_number_seq'),
  idempotency_key       uuid unique not null,
  customer_id           uuid not null references profiles(id),
  butcher_id            uuid not null references butchers(id),
  cut_id                uuid not null references cuts(id),
  mode                  order_mode not null,
  steaks_qty            int,
  est_weight_g          int not null,
  price_per_kg_agorot   int not null,
  total_agorot          int not null,
  status                order_status not null default 'new',
  payment_status        text not null default 'simulated',
  customer_note         text check (char_length(customer_note) <= 300),
  cancel_reason         text,
  cancelled_by          user_role,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index on orders (butcher_id, status, created_at desc);
create index on orders (customer_id, created_at desc);
create index on orders (cut_id, status);

-- ORDER EVENTS (audit)
create table order_events (
  id          bigserial primary key,
  order_id    uuid not null references orders(id) on delete cascade,
  from_status order_status,
  to_status   order_status not null,
  actor_id    uuid references profiles(id),
  note        text,
  created_at  timestamptz not null default now()
);
create index on order_events (order_id, created_at);

-- STOCK EVENTS (audit)
create table stock_events (
  id            bigserial primary key,
  cut_id        uuid not null references cuts(id) on delete cascade,
  type          stock_event_type not null,
  steaks_delta  int not null default 0,
  whole_after   boolean,
  order_id      uuid references orders(id),
  actor_id      uuid references profiles(id),
  reason        text,
  created_at    timestamptz not null default now()
);
create index on stock_events (cut_id, created_at);

-- updated_at maintenance
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger cuts_updated_at   before update on cuts   for each row execute function set_updated_at();
create trigger orders_updated_at before update on orders for each row execute function set_updated_at();
