-- Stage 2, part 2: remove the single-cut order model (run after 0007).
-- Orders placed by the previous app version between 0007 and this migration are first brought into the new
-- model (a purchase + one line each), then the old columns and place_order are dropped.

insert into checkouts (idempotency_key, customer_id, total_agorot, payment_status, created_at)
select idempotency_key, customer_id, total_agorot, payment_status, created_at from orders where checkout_id is null;

update orders o set checkout_id = c.id from checkouts c
where o.checkout_id is null and c.idempotency_key = o.idempotency_key;

insert into order_items (order_id, cut_id, mode, steaks_qty, est_weight_g, price_per_kg_agorot, total_agorot, created_at)
select o.id, o.cut_id, o.mode, o.steaks_qty, o.est_weight_g, o.price_per_kg_agorot, o.total_agorot, o.created_at
from orders o where not exists (select 1 from order_items i where i.order_id = o.id);

update order_items i set status = 'cancelled', cancel_reason = o.cancel_reason, cancelled_by = o.cancelled_by,
                         cancelled_at = o.updated_at, restocked = true
from orders o where o.id = i.order_id and o.status = 'cancelled' and i.status = 'active';

alter table orders alter column checkout_id set not null;
alter table orders
  drop column idempotency_key,
  drop column cut_id,
  drop column mode,
  drop column steaks_qty,
  drop column est_weight_g,
  drop column price_per_kg_agorot;

drop function if exists place_order(uuid, order_mode, int, uuid, text);
