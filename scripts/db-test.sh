#!/usr/bin/env bash
# Runs all migrations + seed + RPC tests against a throwaway local Postgres database.
# Usage: scripts/db-test.sh   (needs psql and a local server; PG* env vars are honoured)
set -euo pipefail
cd "$(dirname "$0")/.."
DB="${TEST_DB:-solor_test}"
PSQL=(psql -v ON_ERROR_STOP=1 -q -X -o /dev/null)

"${PSQL[@]}" -d postgres -c "drop database if exists $DB" -c "create database $DB"
"${PSQL[@]}" -d "$DB" -f supabase/tests/00_mock_supabase.sql
for f in supabase/migrations/*.sql; do
  "${PSQL[@]}" -d "$DB" -f "$f"
done
"${PSQL[@]}" -d "$DB" -f supabase/seed.sql
"${PSQL[@]}" -d "$DB" -f supabase/tests/10_rpc_test.sql
bash supabase/tests/20_concurrency_test.sh "$DB"
"${PSQL[@]}" -d "$DB" -f supabase/tests/50_checkout_hold_test.sql
"${PSQL[@]}" -d "$DB" -f supabase/tests/60_order_tracking_test.sql
"${PSQL[@]}" -d "$DB" -f supabase/tests/70_events_test.sql
"${PSQL[@]}" -d "$DB" -v pw=test-pw -f supabase/demo/demo_login_setup.sql
"${PSQL[@]}" -d "$DB" -f supabase/tests/30_demo_login_test.sql
echo "ALL DB TESTS PASSED"
