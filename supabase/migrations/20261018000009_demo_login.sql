-- Demo sign-in (founders' request, until further notice): the first screen is only "קצב" / "לקוח".
-- Behind the buttons the app signs in to shared demo accounts with one server-side password
-- (DEMO_PASSWORD on Vercel). The demo customer is created once by supabase/demo/demo_login_setup.sql;
-- every shop gets its own demo butcher account, now and whenever a shop is added, carrying the same
-- password hash as the demo customer. Emails use the reserved .example domain: nothing is ever sent.

create or replace function demo_butcher_email(p_butcher uuid) returns text
language sql immutable as $$ select 'demo-butcher-' || p_butcher::text || '@solor.example' $$;

create or replace function demo_ensure_butcher_account(p_butcher uuid) returns void
language plpgsql security definer set search_path = public, auth as $$
declare
  v_hash  text;
  v_email text := demo_butcher_email(p_butcher);
  v_id    uuid := gen_random_uuid();
begin
  select encrypted_password into v_hash from auth.users where email = 'demo-customer@solor.example';
  if v_hash is null or exists (select 1 from auth.users where email = v_email) then
    return;  -- demo sign-in not set up, or this shop already has its account
  end if;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email, v_hash, now(),
          '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
  insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
  values (v_id::text, v_id, jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
          'email', now(), now());
  insert into profiles (id, role, full_name, phone, butcher_id)
  values (v_id, 'butcher', 'קצב הדגמה', '050-0000000', p_butcher);
end $$;

revoke all on function demo_ensure_butcher_account(uuid) from public, anon, authenticated;

create or replace function demo_butcher_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform demo_ensure_butcher_account(new.id);
  return new;
end $$;

revoke all on function demo_butcher_after_insert() from public, anon, authenticated;

create trigger butchers_demo_account after insert on butchers
  for each row execute function demo_butcher_after_insert();

-- shops that already exist (no-op until the demo customer exists)
select demo_ensure_butcher_account(id) from butchers;
