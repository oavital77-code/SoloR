-- "פרוס לי" by steaks (founders 28.10.2026): the customer picks the grams and how many steaks; the thickness follows
-- from them (at least 1.5 cm). The steak count travels with the line (the hold's items carry "steaks") into the order,
-- so the butcher sees "600 גר׳ · 3 סטייקים · עובי 2 ס״מ". Additive: a column and pay_checkout writing it.

alter table order_items add column if not exists slice_steaks smallint check (slice_steaks between 1 and 40);

create or replace function pay_checkout(p_hold_id uuid) returns checkouts
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  h holds;
  k checkouts;
  o orders;
  i items;
  it jsonb;
  rc jsonb;
  v_problems jsonb;
  v_bid uuid;
  v_note text;
  v_mode line_mode;
  v_req int;
  v_weight int;
  v_items int := 0;
begin
  if v_uid is null or current_role_of_user() is distinct from 'customer' then raise exception 'NOT_ALLOWED'; end if;

  select * into h from holds where id = p_hold_id;
  if not found or h.customer_id <> v_uid then raise exception 'NOT_ALLOWED'; end if;
  if h.checkout_id is not null then
    select * into k from checkouts where id = h.checkout_id;
    return k;
  end if;

  perform checkout_lock(h.items);
  select * into h from holds where id = p_hold_id for update;
  if h.checkout_id is not null then
    select * into k from checkouts where id = h.checkout_id;
    return k;
  end if;
  if h.status = 'released' then raise exception 'HOLD_RELEASED'; end if;

  v_problems := checkout_problems(h.items, h.id);
  if jsonb_array_length(v_problems) > 0 then
    raise exception 'CART_UNAVAILABLE' using detail = v_problems::text;
  end if;

  for it in select * from jsonb_array_elements(h.items) loop
    select * into i from items where id = (it->>'item_id')::uuid;
    v_items := v_items + line_total(i, (it->>'mode')::line_mode, nullif(it->>'requested_g', '')::int);
  end loop;
  if v_items <> h.items_agorot then raise exception 'PRICE_CHANGED'; end if;

  insert into checkouts (idempotency_key, customer_id, contact_name, contact_phone, is_demo)
  values (h.idempotency_key, v_uid, h.contact->>'name', h.contact->>'phone', true)
  returning * into k;

  for v_bid in select distinct x.butcher_id from items x
               where x.id in (select (e->>'item_id')::uuid from jsonb_array_elements(h.items) e) order by 1 loop
    v_note := nullif(trim(coalesce(h.notes->>v_bid::text, '')), '');
    rc := h.receive->(v_bid::text);
    insert into orders (checkout_id, customer_id, butcher_id, total_agorot, customer_note,
                        receive_method, delivery_address, delivery_window, delivery_fee_agorot)
    values (k.id, v_uid, v_bid, 0, v_note,
            coalesce(rc->>'method', 'pickup'), nullif(rc->'address', 'null'::jsonb), rc->>'window',
            coalesce((rc->>'fee_agorot')::int, 0))
    returning * into o;

    for it in select e from jsonb_array_elements(h.items) e
              join items x on x.id = (e->>'item_id')::uuid and x.butcher_id = v_bid loop
      select * into i from items where id = (it->>'item_id')::uuid;
      v_mode := (it->>'mode')::line_mode;
      v_req := case when v_mode = 'remainder_slice' then (it->>'requested_g')::int end;
      v_weight := line_weight(i, v_mode, v_req);

      insert into order_items (order_id, item_id, mode, requested_g, slice_thickness_cm, slice_steaks, est_weight_g,
                               price_per_kg_agorot, total_agorot)
      values (o.id, i.id, v_mode, v_req,
              case when v_mode = 'remainder_slice' then nullif(it->>'thickness_cm', '')::numeric end,
              case when v_mode = 'remainder_slice' then least(greatest(nullif(it->>'steaks', '')::int, 1), 40) end,
              v_weight, i.price_per_kg_agorot, line_total(i, v_mode, v_req));

      perform set_config('solor.rpc', 'on', true);
      if v_mode = 'remainder_slice' then
        update items set weight_g = weight_g - v_weight where id = i.id returning * into i;
      else
        update items set status = 'sold_out', sold_out_at = now(),
                         weight_g = case when kind = 'remainder' then 0 else weight_g end
        where id = i.id returning * into i;
      end if;
      perform set_config('solor.rpc', 'off', true);

      insert into stock_events (item_id, type, weight_delta_g, weight_after_g, order_id, actor_id)
      values (i.id, 'order', -v_weight, i.weight_g, o.id, v_uid);
    end loop;

    update orders set total_agorot = (select sum(total_agorot) from order_items where order_id = o.id)
    where id = o.id;
    insert into order_events (order_id, from_status, to_status, actor_id) values (o.id, null, 'new', v_uid);
  end loop;

  update checkouts set total_agorot = h.total_agorot where id = k.id returning * into k;
  update holds set status = 'consumed', checkout_id = k.id where id = h.id;
  return k;
end $$;
