-- Order tracking (customer spec §11, step 8): what the butcher records while preparing, shown to the customer.
--
--   order_items.delivered_weight_g   the weight actually supplied (the butcher weighs it when packing)
--   order_items.refund_agorot        the weight rule (§9.3): supplied more than 5% under what was ordered →
--   order_items.refund_status        the whole missing weight is refunded at the order's price per kg; within ±5%
--                                     nothing changes; over is never charged. 'pending' until a payment provider
--                                     exists to return it ('refunded' then).
--   orders.ready_photo_path           the butcher's photo of the prepared order, shown once it is ready or on its way
--
-- A line cancelled by the shop is credited in full (its total_agorot); no new column is needed for that.

alter table order_items
  add column if not exists delivered_weight_g int check (delivered_weight_g between 1 and 50000),
  add column if not exists refund_agorot      int check (refund_agorot > 0),
  add column if not exists refund_status      text check (refund_status in ('pending', 'refunded'));

alter table orders
  add column if not exists ready_photo_path text;

-- §9.3: the amount to refund for a supplied weight (0 within the tolerance or over it)
create or replace function weight_refund(p_ordered_g int, p_delivered_g int, p_price_per_kg_agorot int) returns int
language sql immutable set search_path = public as $$
  select case when p_delivered_g::bigint * 100 < p_ordered_g::bigint * 95
              then price_for_weight(p_ordered_g - p_delivered_g, p_price_per_kg_agorot) else 0 end
$$;

-- The butcher records the weight supplied for one line, while the order is still open.
create or replace function record_item_weight(p_item_id uuid, p_weight_g int) returns order_items
language plpgsql security definer set search_path = public as $$
declare
  v_bid uuid := current_butcher_id();
  i order_items;
  o orders;
  v_refund int;
begin
  if v_bid is null then raise exception 'NOT_ALLOWED'; end if;
  select * into i from order_items where id = p_item_id;
  if not found then raise exception 'NOT_ALLOWED'; end if;
  select * into o from orders where id = i.order_id for update;
  if o.butcher_id <> v_bid then raise exception 'NOT_ALLOWED'; end if;
  if o.status not in ('new', 'preparing', 'ready') or i.status <> 'active' then raise exception 'INVALID_TRANSITION'; end if;
  if p_weight_g is null or p_weight_g < 1 or p_weight_g > 50000 then raise exception 'INVALID_WEIGHT'; end if;

  v_refund := weight_refund(i.est_weight_g, p_weight_g, i.price_per_kg_agorot);
  update order_items set delivered_weight_g = p_weight_g,
                         refund_agorot = nullif(v_refund, 0),
                         refund_status = case when v_refund > 0 then 'pending' end
  where id = i.id returning * into i;
  return i;
end $$;

-- The butcher's photo of the prepared order (a path in the shop's own folder of the media bucket; null removes it).
create or replace function set_ready_photo(p_order_id uuid, p_path text) returns orders
language plpgsql security definer set search_path = public as $$
declare
  v_bid uuid := current_butcher_id();
  o orders;
begin
  if v_bid is null then raise exception 'NOT_ALLOWED'; end if;
  select * into o from orders where id = p_order_id for update;
  if not found or o.butcher_id <> v_bid then raise exception 'NOT_ALLOWED'; end if;
  if o.status = 'cancelled' then raise exception 'INVALID_TRANSITION'; end if;
  if p_path is not null and p_path not like v_bid::text || '/orders/' || o.id::text || '/%' then raise exception 'NOT_ALLOWED'; end if;
  update orders set ready_photo_path = p_path where id = o.id returning * into o;
  return o;
end $$;

revoke execute on function weight_refund(int, int, int), record_item_weight(uuid, int), set_ready_photo(uuid, text) from public, anon;
grant execute on function record_item_weight(uuid, int), set_ready_photo(uuid, text) to authenticated;
