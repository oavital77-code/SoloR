#!/usr/bin/env bash
# Two customers press "confirm" at the same moment on a cut with 1 steak left → exactly one wins.
set -euo pipefail
DB="$1"
PSQL=(psql -X -q -t -A -d "$DB")
C1=10000000-0000-4000-8000-0000000000c1
C2=10000000-0000-4000-8000-0000000000c2
B=10000000-0000-4000-8000-00000000000b

CUT=$("${PSQL[@]}" -v ON_ERROR_STOP=1 <<SQL | tail -1
set role authenticated; set request.jwt.claim.sub = '$B';
insert into cuts (butcher_id, cut_type, breed_key, origin_country, is_aged, weight_g, price_per_kg_agorot, sale_mode, steak_weight_g, steaks_planned)
values ('00000000-0000-4000-8000-000000000001', 'sinta', 'wagyu', 'JP', false, 1000, 50000, 'steaks', 300, 1) returning id;
SQL
)
"${PSQL[@]}" -v ON_ERROR_STOP=1 <<SQL >/dev/null
insert into cut_media (cut_id, type, storage_path) values ('$CUT', 'photo', 'p/q/r.jpg');
set role authenticated; set request.jwt.claim.sub = '$B';
select publish_cut('$CUT');
SQL

order_sql() {
  # The first statement locks the cut row for 1s from a third session so both orders queue on the same lock.
  cat <<SQL
set role authenticated; set request.jwt.claim.sub = '$1';
select 'OK:' || order_number from place_order('$CUT', 'steaks', 1, gen_random_uuid(), null);
SQL
}

# hold the row lock briefly so both requests arrive while it is locked
( "${PSQL[@]}" -c "begin; select 1 from cuts where id = '$CUT' for update; select pg_sleep(1); commit;" >/dev/null ) &
sleep 0.2
OUT1=$(mktemp); OUT2=$(mktemp)
( order_sql $C1 | "${PSQL[@]}" >"$OUT1" 2>&1 || true ) &
( order_sql $C2 | "${PSQL[@]}" >"$OUT2" 2>&1 || true ) &
wait

R1=$(cat "$OUT1"); R2=$(cat "$OUT2")
echo "client 1: $R1"
echo "client 2: $R2"
OKS=$(printf '%s\n%s\n' "$R1" "$R2" | grep -c '^OK:' || true)
FAILS=$(printf '%s\n%s\n' "$R1" "$R2" | grep -c 'NOT_ENOUGH_STEAKS' || true)
ORDERS=$("${PSQL[@]}" -c "select count(*) from orders where cut_id = '$CUT'")
STOCK=$("${PSQL[@]}" -c "select steaks_available || '/' || status from cuts where id = '$CUT'")
echo "orders=$ORDERS stock=$STOCK"
if [[ "$OKS" == 1 && "$FAILS" == 1 && "$ORDERS" == 1 && "$STOCK" == "0/sold_out" ]]; then
  echo "Concurrency test passed"
else
  echo "Concurrency test FAILED"; exit 1
fi

# Same key twice in parallel (double tap) → one order
KEY=$(cat /proc/sys/kernel/random/uuid)
CUT2=$("${PSQL[@]}" -v ON_ERROR_STOP=1 <<SQL | tail -1
set role authenticated; set request.jwt.claim.sub = '$B';
insert into cuts (butcher_id, cut_type, breed_key, origin_country, is_aged, weight_g, price_per_kg_agorot, sale_mode, steak_weight_g)
values ('00000000-0000-4000-8000-000000000001', 'denver', 'wagyu', 'AU', false, 3000, 20000, 'steaks', 300) returning id;
SQL
)
"${PSQL[@]}" -v ON_ERROR_STOP=1 >/dev/null <<SQL
insert into cut_media (cut_id, type, storage_path) values ('$CUT2', 'photo', 'p/q/s.jpg');
set role authenticated; set request.jwt.claim.sub = '$B';
select publish_cut('$CUT2');
SQL
dbl() { printf "set role authenticated; set request.jwt.claim.sub = '%s';\nselect order_number from place_order('%s', 'steaks', 2, '%s', null);\n" "$C1" "$CUT2" "$KEY" | "${PSQL[@]}"; }
( "${PSQL[@]}" -c "begin; select 1 from cuts where id = '$CUT2' for update; select pg_sleep(1); commit;" >/dev/null ) &
sleep 0.2
dbl > "$OUT1" 2>&1 & dbl > "$OUT2" 2>&1 & wait
echo "double tap: $(cat "$OUT1") / $(cat "$OUT2")"
N=$("${PSQL[@]}" -c "select count(*) || '/' || (select steaks_available from cuts where id = '$CUT2') from orders where cut_id = '$CUT2'")
if [[ "$N" == "1/8" && "$(cat "$OUT1")" == "$(cat "$OUT2")" ]]; then
  echo "Idempotency test passed"
else
  echo "Idempotency test FAILED ($N)"; exit 1
fi
rm -f "$OUT1" "$OUT2"
