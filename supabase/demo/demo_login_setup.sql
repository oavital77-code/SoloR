-- One-time setup for the demo sign-in screen ("קצב" / "לקוח"), after migration 0009.
-- Creates the shared demo customer with the password that is set as DEMO_PASSWORD on Vercel,
-- then a demo butcher account for every shop. Safe to run again.
-- psql: psql -v pw='<DEMO_PASSWORD>' -f supabase/demo/demo_login_setup.sql
-- SQL Editor: replace :'pw' below with the password in quotes.
select set_config('demo.pw', :'pw', false);
do $$
declare v_id uuid := gen_random_uuid();
begin
  if not exists (select 1 from auth.users where email = 'demo-customer@solor.example') then
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
            'demo-customer@solor.example', extensions.crypt(current_setting('demo.pw'), extensions.gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
    insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
    values (v_id::text, v_id, jsonb_build_object('sub', v_id::text, 'email', 'demo-customer@solor.example', 'email_verified', true),
            'email', now(), now());
    insert into public.profiles (id, role, full_name, phone) values (v_id, 'customer', 'לקוח הדגמה', '050-0000000');
  end if;
end $$;

select demo_ensure_butcher_account(id) from butchers;
