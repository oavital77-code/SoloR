-- Demo counter (docs/BUTCHER_FLOW.md): 10 parent cuts with generated media served by the app itself (public/demo/dNN).
-- Split parents carry units ("523-1" …) and, for some, the remainder back on the counter; the others are sold
-- whole by weight. For showing the product only. Remove with supabase/demo/remove_demo.sql.
-- Runs as the database owner, with the RPC guard flag set (what publish_item would do, without the photo step).
begin;
select set_config('solor.rpc', 'on', true);

create temp table demo_in (
  key text, shop text, cut_type cut_type, breed_key text, breed_other text, origin origin_country,
  aged boolean, aging_days int, aging_method aging_method, marbling smallint, description text,
  price_kg int, hours_ago numeric, video boolean,
  units text,          -- 'steaks:grams,…' ('' = not split)
  remainder_g int      -- what is back on the counter (null = nothing left)
) on commit drop;

insert into demo_in values
 ('d01','butcher-1','entrecote','black_angus',null,'AR',true,28,'dry',8,'אנטריקוט מהצלע הגבוהה, שיש עדין לאורך כל הנתח ושכבת שומן מלאה בצד. מושלם לגריל חם.',22000,0.4,true,'3:1240,2:830,3:1180',1100),
 ('d02','butcher-1','picanha','villa_mercedes',null,'UY',false,null,null,6,'פיקניה שלמה עם כובע שומן עבה. לצלייה בשלמותה או לחיתוך לסטייקים לאורך הסיבים.',16000,2,true,'',1600),
 ('d03','test-b','ontrib',null,'הולשטיין','IL',true,21,'wet',7,'אונטריב עם עצם, יושן בוואקום. מתאים לבישול ארוך או לצלייה איטית.',14500,5,true,'',2800),
 ('d04','test-b','asado','black_angus',null,'AR',false,null,null,6,'רצועת אסאדו עם שלוש עצמות, לעישון או לצלייה ארוכה על גחלים.',11000,7,true,'',3200),
 ('d05','butcher-1','sinta','wagyu',null,'AU',true,35,'dry',10,'סינטה ואגיו אוסטרלי, שיש צפוף מאוד. פרוסות דקות, צלייה קצרה מאוד.',69000,1,true,'2:520,2:490',780),
 ('d06','test-b','denver','villa_mercedes',null,'PY',false,null,null,7,'דנוור — נתח מהכתף, רך וטעים, במחיר נוח. לסטייקים דקים.',17500,9,false,'3:610,3:590,2:420',null),
 ('d07','butcher-1','shaitel',null,'אנגוס מקומי','IL',true,14,'dry',5,'שייטל רזה עם קצה שומן, יושן שבועיים. לסטייקים או לרוסטביף.',13000,12,false,'',2000),
 ('d08','butcher-1','entrecote','wagyu',null,'JP',true,21,'wet',10,'אנטריקוט ואגיו יפני, דרגת שיש גבוהה במיוחד. כמות מוגבלת.',120000,0.2,true,'1:210,2:430',null),
 ('d09','test-b','sinta','black_angus',null,'UY',true,28,'dry',7,'סינטה מיושנת יבש 28 יום, טעם עמוק ואגוזי. מגיעה עם שכבת שומן.',18500,3,true,'2:640,2:610',950),
 ('d10','test-b','picanha','black_angus',null,'AR',true,14,'dry',6,'פיקניה בלאק אנגוס מיושנת, חתוכה לסטייקים עם כובע השומן.',17000,20,false,'2:600,2:580,2:560',null);

create temp table demo_parent (key text, id uuid, code int) on commit drop;
with ins as (
  insert into parents (code, butcher_id, status, split, cut_type, breed_key, breed_other, origin_country, is_aged, aging_days,
                       aging_method, butcher_marbling, description, price_per_kg_agorot, video_path, video_poster_path,
                       next_unit_no, created_at, closed_at)
  select nextval('parent_code_seq'), b.id, 'closed', d.units <> '', d.cut_type, d.breed_key, d.breed_other, d.origin, d.aged,
         d.aging_days, d.aging_method, d.marbling, d.description, d.price_kg,
         case when d.video then '/demo/' || d.key || '/clip.mp4' end, case when d.video then '/demo/' || d.key || '/1.jpg' end,
         coalesce(array_length(string_to_array(nullif(d.units, ''), ','), 1), 0) + 1,
         now() - make_interval(secs => (d.hours_ago * 3600 + 900)::int), now() - make_interval(secs => (d.hours_ago * 3600)::int)
  from (select * from demo_in order by hours_ago desc) d join butchers b on b.slug = d.shop   -- older demo cuts get lower codes
  returning id, code, description
)
insert into demo_parent select d.key, ins.id, ins.code from ins join demo_in d on d.description = ins.description;

create temp table demo_item (key text, id uuid, n int) on commit drop;
with u as (
  select d.key, p.id as parent_id, p.code, b.id as butcher_id, d.price_kg, d.hours_ago, x.n::int as n,
         split_part(x.s, ':', 1)::int as steaks, split_part(x.s, ':', 2)::int as grams
  from demo_in d join demo_parent p using (key) join butchers b on b.slug = d.shop
  cross join lateral unnest(string_to_array(nullif(d.units, ''), ',')) with ordinality as x(s, n)
), ins as (
  insert into items (parent_id, butcher_id, kind, unit_no, label, steak_count, weight_g, price_per_kg_agorot, weight_source,
                     status, published_at, created_at)
  select parent_id, butcher_id, 'unit', n, code || '-' || n, steaks, grams, price_kg, 'scan', 'published',
         now() - make_interval(secs => (hours_ago * 3600)::int + 60 * (4 - n)), now() - make_interval(secs => (hours_ago * 3600)::int + 600)
  from u
  returning id, parent_id, unit_no
)
insert into demo_item select p.key, ins.id, ins.unit_no from ins join demo_parent p on p.id = ins.parent_id;

with ins as (
  insert into items (parent_id, butcher_id, kind, label, weight_g, price_per_kg_agorot, weight_source, status, published_at, created_at)
  select p.id, b.id, 'remainder', p.code::text, d.remainder_g, d.price_kg, 'manual', 'published',
         now() - make_interval(secs => (d.hours_ago * 3600)::int), now() - make_interval(secs => (d.hours_ago * 3600)::int + 600)
  from demo_in d join demo_parent p using (key) join butchers b on b.slug = d.shop
  where d.remainder_g is not null
  returning id, parent_id
)
insert into demo_item select p.key, ins.id, 0 from ins join demo_parent p on p.id = ins.parent_id;

-- photos: every item has the three shots of its cut, each item with a different one first
insert into cut_media (item_id, type, storage_path, thumb_path, is_cover, sort_order, width, height)
select i.id, 'photo', '/demo/' || i.key || '/' || k || '.jpg', '/demo/' || i.key || '/' || k || '-t.jpg',
       k = (i.n % 3) + 1, (k - (i.n % 3) - 1 + 3) % 3, 1080, 1350
from demo_item i cross join generate_series(1, 3) k;

insert into stock_events (item_id, type, weight_delta_g, weight_after_g, reason)
select it.id, 'publish', it.weight_g, it.weight_g, 'demo' from items it join demo_item i on i.id = it.id;

select p.code, b.slug, p.cut_type, p.split, string_agg(it.label || ' ' || it.weight_g || 'g', ', ' order by it.unit_no nulls last) as items
from demo_parent dp join parents p on p.id = dp.id join butchers b on b.id = p.butcher_id join items it on it.parent_id = p.id
group by p.code, b.slug, p.cut_type, p.split order by p.code;
commit;
