-- SoloR seed — breeds + one butcher shop (placeholders for the founders to fill in).
-- No cuts are seeded: real meat, real photos only.

insert into breeds (key, label_he, sort_order) values
  ('black_angus',    'בלאק אנגוס',  10),
  ('villa_mercedes', 'וילה מרסדס',  20),
  ('wagyu',          'ואגיו',        30)
on conflict (key) do nothing;

insert into butchers (id, name, address, phone, pickup_hours, slug) values
  ('00000000-0000-4000-8000-000000000001',
   'מעדני בן עזרא', 'כתובת לעדכון', '03-0000000', 'א׳-ה׳ 08:00-19:00, ו׳ 08:00-14:00', 'butcher-1')
on conflict (id) do nothing;

-- A second shop (marketplace with more than one butcher: content and stock per shop)
insert into butchers (id, name, address, phone, pickup_hours, slug, city, description, is_test) values
  ('00000000-0000-4000-8000-000000000002',
   'קצביית האחים חדיף', 'כתובת בדיקה', '03-0000001', 'א׳-ה׳ 09:00-18:00',
   'test-b', 'תל אביב', null, false)
on conflict (id) do nothing;

-- To turn an existing user into the butcher (run after they signed up and completed their profile):
--   update profiles set role = 'butcher', butcher_id = '00000000-0000-4000-8000-000000000001'
--   where id = (select id from auth.users where email = 'butcher@example.com');

-- shop page hours (migration 0011): the same hours as pickup_hours, structured (Israel time, "0" = Sunday)
update butchers set opening_hours = '{"0":[["08:00","19:00"]],"1":[["08:00","19:00"]],"2":[["08:00","19:00"]],"3":[["08:00","19:00"]],"4":[["08:00","19:00"]],"5":[["08:00","14:00"]]}'
where slug = 'butcher-1';
update butchers set opening_hours = '{"0":[["09:00","18:00"]],"1":[["09:00","18:00"]],"2":[["09:00","18:00"]],"3":[["09:00","18:00"]],"4":[["09:00","18:00"]]}'
where slug = 'test-b';
