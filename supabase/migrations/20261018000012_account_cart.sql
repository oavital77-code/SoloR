-- The cart kept on the account (customer spec §9.1): the device's cart is merged into it after signing in and
-- follows the customer to another device. One row per customer; the lines are the app's cart lines as JSON.
-- Still a cart, not a reservation: nothing here holds stock.

create table if not exists carts (
  user_id    uuid primary key references auth.users on delete cascade,
  lines      jsonb not null default '[]' check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) <= 30),
  updated_at timestamptz not null default now()
);

alter table carts enable row level security;
revoke all on carts from anon, authenticated;
grant select, insert, update on carts to authenticated;

create policy carts_own on carts for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
