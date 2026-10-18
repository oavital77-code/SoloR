-- Demo sign-in accounts (0009 + supabase/demo/demo_login_setup.sql). Run after the setup script with pw=test-pw.
do $$
declare v_shops int; v_new uuid;
begin
  assert (select count(*) from auth.users where email = 'demo-customer@solor.example') = 1, 'one demo customer';
  assert (select p.role::text from profiles p join auth.users u on u.id = p.id where u.email = 'demo-customer@solor.example') = 'customer';
  assert (select encrypted_password = extensions.crypt('test-pw', encrypted_password) from auth.users
          where email = 'demo-customer@solor.example'), 'password hash matches';

  select count(*) into v_shops from butchers;
  assert (select count(*) from butchers b join auth.users u on u.email = demo_butcher_email(b.id)
          join profiles p on p.id = u.id and p.role = 'butcher' and p.butcher_id = b.id) = v_shops, 'every shop has its demo butcher';
  assert (select count(*) from auth.identities i join auth.users u on u.id = i.user_id where u.email like 'demo-%@solor.example') = v_shops + 1,
    'an email identity per demo account';

  -- a new shop gets its account from the trigger, with the shared password
  insert into butchers (name, address, phone, slug) values ('קצביית בדיקה', 'רחוב 1', '03-0000000', 'demo-new') returning id into v_new;
  assert (select encrypted_password = extensions.crypt('test-pw', encrypted_password) from auth.users
          where email = demo_butcher_email(v_new)), 'new shop demo butcher with the shared password';

  -- running the setup logic again creates nothing new
  perform demo_ensure_butcher_account(id) from butchers;
  assert (select count(*) from auth.users where email like 'demo-%@solor.example') = v_shops + 2, 'idempotent';

  -- the helper is not callable from the app
  assert not has_function_privilege('authenticated', 'demo_ensure_butcher_account(uuid)', 'execute');
  assert not has_function_privilege('anon', 'demo_ensure_butcher_account(uuid)', 'execute');
  raise notice 'Demo login test passed';
end $$;
