-- Demo catalogue: 10 published cuts with generated media served by the app itself (public/demo/dNN).
-- For showing the product only. Remove with supabase/demo/remove_demo_cuts.sql.
-- Runs as the database owner: cuts are inserted as drafts, then published the way publish_cut does
-- (stock from compute_stock + a 'publish' stock event), with the RPC guard flag set for the update.
begin;
select set_config('solor.rpc', 'on', true);

create temp table demo_in (
  key text, shop text, cut_type cut_type, breed_key text, breed_other text, origin origin_country,
  aged boolean, aging_days int, aging_method aging_method, marbling smallint, description text,
  weight_g int, price_kg int, sale_mode sale_mode, steak_g int, thickness numeric, hours_ago numeric, video boolean
) on commit drop;

insert into demo_in values
 ('d01','butcher-1','entrecote','black_angus',null,'AR',true,28,'dry',8,'אנטריקוט מהצלע הגבוהה, שיש עדין לאורך כל הנתח ושכבת שומן מלאה בצד. מושלם לגריל חם.',2400,22000,'both',300,3.0,0.4,true),
 ('d02','butcher-1','picanha','villa_mercedes',null,'UY',false,null,null,6,'פיקניה שלמה עם כובע שומן עבה. לצלייה בשלמותה או לחיתוך לסטייקים לאורך הסיבים.',1600,16000,'whole',null,null,2,true),
 ('d03','butcher-1','ontrib',null,'הולשטיין','IL',true,21,'wet',7,'אונטריב עם עצם, יושן בוואקום. מתאים לבישול ארוך או לצלייה איטית.',2800,14500,'steaks',400,4.0,5,true),
 ('d04','test-b','asado','black_angus',null,'AR',false,null,null,6,'רצועת אסאדו עם שלוש עצמות, לעישון או לצלייה ארוכה על גחלים.',3200,11000,'whole',null,null,7,true),
 ('d05','butcher-1','sinta','wagyu',null,'AU',true,35,'dry',10,'סינטה ואגיו אוסטרלי, שיש צפוף מאוד. פרוסות דקות, צלייה קצרה מאוד.',1800,69000,'steaks',250,2.5,1,true),
 ('d06','test-b','denver','villa_mercedes',null,'PY',false,null,null,7,'דנוור — נתח מהכתף, רך וטעים, במחיר נוח. לסטייקים דקים.',1200,17500,'steaks',200,2.0,9,false),
 ('d07','butcher-1','shaitel',null,'אנגוס מקומי','IL',true,14,'dry',5,'שייטל רזה עם קצה שומן, יושן שבועיים. לסטייקים או לרוסטביף.',2000,13000,'both',250,2.5,12,false),
 ('d08','butcher-1','entrecote','wagyu',null,'JP',true,21,'wet',10,'אנטריקוט ואגיו יפני, דרגת שיש גבוהה במיוחד. כמות מוגבלת.',1400,120000,'steaks',200,2.0,0.2,true),
 ('d09','test-b','sinta','black_angus',null,'UY',true,28,'dry',7,'סינטה מיושנת יבש 28 יום, טעם עמוק ואגוזי. מגיעה עם שכבת שומן.',2200,18500,'both',300,3.0,3,true),
 ('d10','butcher-1','picanha','black_angus',null,'AR',true,14,'dry',6,'פיקניה בלאק אנגוס מיושנת, חתוכה לסטייקים עם כובע השומן.',1400,17000,'steaks',300,3.0,20,false);

create temp table demo_new (key text, id uuid) on commit drop;

with ins as (
  insert into cuts (butcher_id, status, cut_type, breed_key, breed_other, origin_country, is_aged, aging_days,
                    aging_method, butcher_marbling, description, weight_g, price_per_kg_agorot, sale_mode,
                    steak_weight_g, steak_thickness_cm, created_at)
  select b.id, 'draft', d.cut_type, d.breed_key, d.breed_other, d.origin, d.aged, d.aging_days, d.aging_method,
         d.marbling, d.description, d.weight_g, d.price_kg, d.sale_mode, d.steak_g, d.thickness,
         now() - make_interval(secs => (d.hours_ago * 3600 + 600)::int)
  from demo_in d join butchers b on b.slug = d.shop
  order by d.hours_ago desc  -- older demo cuts get lower codes
  returning id, description
)
insert into demo_new select d.key, ins.id from ins join demo_in d on d.description = ins.description;

insert into cut_media (cut_id, type, storage_path, thumb_path, poster_path, is_cover, sort_order, width, height, duration_s)
select n.id, 'photo', '/demo/' || n.key || '/' || k || '.jpg', '/demo/' || n.key || '/' || k || '-t.jpg', null,
       k = 1, k - 1, 1080, 1350, null
from demo_new n cross join generate_series(1, 3) k;

insert into cut_media (cut_id, type, storage_path, thumb_path, poster_path, is_cover, sort_order, width, height, duration_s)
select n.id, 'video', '/demo/' || n.key || '/clip.mp4', null, '/demo/' || n.key || '/1.jpg', false, 10, 720, 900, 8
from demo_new n join demo_in d using (key) where d.video;

update cuts c set status = 'published',
  published_at = now() - make_interval(secs => (d.hours_ago * 3600)::int),
  steaks_total = (compute_stock(c)).steaks_total,
  steaks_available = (compute_stock(c)).steaks_total,
  whole_available = (compute_stock(c)).whole_available
from demo_new n join demo_in d using (key)
where c.id = n.id;

insert into stock_events (cut_id, type, steaks_delta, whole_after, reason)
select c.id, 'publish', c.steaks_total, c.whole_available, 'demo'
from cuts c join demo_new n on n.id = c.id;

select c.code, b.slug, c.cut_type, c.sale_mode, c.steaks_total, c.whole_available,
       (select count(*) from cut_media m where m.cut_id = c.id) as media
from cuts c join demo_new n on n.id = c.id join butchers b on b.id = c.butcher_id
order by c.code;
commit;
