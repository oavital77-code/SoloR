#!/usr/bin/env bash
# Two customers press "confirm" at the same moment on the same unit → exactly one wins.
# Then the same purchase key twice in parallel (double tap) → one order.
set -euo pipefail
DB="$1"
PSQL=(psql -X -q -t -A -d "$DB")
C1=10000000-0000-4000-8000-0000000000c1
C2=10000000-0000-4000-8000-0000000000c2
B=10000000-0000-4000-8000-00000000000b

# a live parent with one unit, and a remainder of 2,000 g on another
new_item() {  # $1 = split true|false → prints the item id
  "${PSQL[@]}" -v ON_ERROR_STOP=1 <<SQL | tail -1
set role authenticated; set request.jwt.claim.sub = '$B';
select set_config('t.p', (select id::text from start_parent(true)), false);
select stop_recording(current_setting('t.p')::uuid);
update parents set cut_type = 'sinta', breed_key = 'wagyu', origin_country = 'JP', is_aged = false, price_per_kg_agorot = 50000
where id = current_setting('t.p')::uuid;
select set_split(current_setting('t.p')::uuid, $1);
select set_config('t.i', (select coalesce((select id from items where parent_id = current_setting('t.p')::uuid and kind = 'remainder'),
                                          (select id from new_unit(current_setting('t.p')::uuid))))::text, false);
update items set weight_g = 2000, steak_count = case when kind = 'unit' then 2 end where id = current_setting('t.i')::uuid;
insert into cut_media (item_id, type, storage_path) values (current_setting('t.i')::uuid, 'photo', 'p/q/r.jpg');
select publish_item(current_setting('t.i')::uuid);
select close_parent(current_setting('t.p')::uuid);
select current_setting('t.i');
SQL
}
UNIT=$(new_item true)

order_sql() {
  cat <<SQL
set role authenticated; set request.jwt.claim.sub = '$1';
select 'OK:' || checkout_number from place_checkout(jsonb_build_array(jsonb_build_object('item_id', '$UNIT', 'mode', 'unit')), gen_random_uuid(), '{}');
SQL
}

# hold the row lock briefly so both requests arrive while it is locked
( "${PSQL[@]}" -c "begin; select 1 from items where id = '$UNIT' for update; select pg_sleep(1); commit;" >/dev/null ) &
sleep 0.2
OUT1=$(mktemp); OUT2=$(mktemp)
( order_sql $C1 | "${PSQL[@]}" >"$OUT1" 2>&1 || true ) &
( order_sql $C2 | "${PSQL[@]}" >"$OUT2" 2>&1 || true ) &
wait

R1=$(cat "$OUT1"); R2=$(cat "$OUT2")
echo "client 1: $R1"
echo "client 2: $R2"
OKS=$(printf '%s\n%s\n' "$R1" "$R2" | grep -c '^OK:' || true)
FAILS=$(printf '%s\n%s\n' "$R1" "$R2" | grep -c 'CART_UNAVAILABLE' || true)
ORDERS=$("${PSQL[@]}" -c "select count(*) from order_items where item_id = '$UNIT'")
STOCK=$("${PSQL[@]}" -c "select status from items where id = '$UNIT'")
echo "orders=$ORDERS stock=$STOCK"
if [[ "$OKS" == 1 && "$FAILS" == 1 && "$ORDERS" == 1 && "$STOCK" == "sold_out" ]]; then
  echo "Concurrency test passed"
else
  echo "Concurrency test FAILED"; exit 1
fi

# Same key twice in parallel (double tap) on a slice → one order, 400 g taken once
KEY=$(cat /proc/sys/kernel/random/uuid)
REM=$(new_item false)
dbl() { printf "set role authenticated; set request.jwt.claim.sub = '%s';\nselect checkout_number from place_checkout(jsonb_build_array(jsonb_build_object('item_id', '%s', 'mode', 'remainder_slice', 'requested_g', 400)), '%s', '{}');\n" "$C1" "$REM" "$KEY" | "${PSQL[@]}"; }
( "${PSQL[@]}" -c "begin; select 1 from items where id = '$REM' for update; select pg_sleep(1); commit;" >/dev/null ) &
sleep 0.2
dbl > "$OUT1" 2>&1 & dbl > "$OUT2" 2>&1 & wait
echo "double tap: $(cat "$OUT1") / $(cat "$OUT2")"
N=$("${PSQL[@]}" -c "select count(*) || '/' || (select weight_g from items where id = '$REM') from order_items where item_id = '$REM'")
if [[ "$N" == "1/1600" && "$(cat "$OUT1")" == "$(cat "$OUT2")" ]]; then
  echo "Idempotency test passed"
else
  echo "Idempotency test FAILED ($N)"; exit 1
fi
rm -f "$OUT1" "$OUT2"
