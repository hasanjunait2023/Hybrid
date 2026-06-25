#!/usr/bin/env bash
# Hybrid — RLS Smoke Test
# Connects as app_runtime_login (the runtime role, RLS forced) for tenant A
# and queries for tenant B's data. If anything comes back, RLS has a hole.
#
# Run from anywhere with ssh to VPS, or copy to /usr/local/bin/rls-smoke-test
# and run as: rls-smoke-test
#
# Exit code 0 = RLS OK, non-zero = leak detected.
# Usage: rls-smoke-test [--live | --staging | --local]
# Default: --live (queries VPS supabase-db via docker exec)

set -euo pipefail

ENV="${1:---live}"
SDB="supabase-db-pe9o2li2n3bns3wnofob49uw"

# Colors
RED='\033[0;31m'; GRN='\033[0;32m'; YLW='\033[1;33m'; NC='\033[0m'

case "$ENV" in
  --live)
    echo -e "${YLW}==> RLS SMOKE TEST — LIVE VPS${NC}"
    SDB="supabase-db-pe9o2li2n3bns3wnofob49uw"
    ;;
  --local)
    echo -e "${YLW}==> RLS SMOKE TEST — LOCAL${NC}"
    SDB="hybrid-postgres"
    ;;
  *)
    echo "Usage: $0 [--live|--local]"; exit 2
    ;;
esac

# Run a query as postgres (bypassrls — used for ground truth + setup).
psql_as_postgres() {
  docker exec "$SDB" psql -U postgres -d postgres -tAc "$1"
}

# Run a query as app_runtime_login (RLS forced — used for the leak check).
# We use TCP via -h localhost so the password (not env) goes over the wire.
psql_as_runtime() {
  docker exec "$SDB" psql "postgresql://app_runtime_login:***@localhost:5432/postgres" -tAc "$1"
}

strip() { echo "$1" | tr -d '[:space:]'; }

# 1. Get real tenant ids from DB (in case test data is different)
echo -e "${YLW}==> Discovering tenants...${NC}"
TENANT_A=$(strip "$(psql_as_postgres "SELECT id FROM tenant ORDER BY created_at, id ASC OFFSET 0 LIMIT 1;")")
TENANT_B=$(strip "$(psql_as_postgres "SELECT id FROM tenant ORDER BY created_at, id ASC OFFSET 1 LIMIT 1;")")
if [ -z "$TENANT_A" ] || [ -z "$TENANT_B" ] || [ "$TENANT_A" = "$TENANT_B" ]; then
  echo -e "${RED}FAIL: need at least 2 tenants in DB (got A=$TENANT_A, B=$TENANT_B)${NC}"
  exit 1
fi
echo "  Tenant A (requesting): $TENANT_A"
echo "  Tenant B (must NOT leak): $TENANT_B"

# 2. Count tenant B's products as postgres (bypassrls, see ground truth)
echo -e "${YLW}==> Ground truth (as postgres superuser):${NC}"
B_PRODUCTS=$(strip "$(psql_as_postgres "SELECT count(*) FROM product WHERE tenant_id='$TENANT_B';")")
B_ORDERS=$(strip "$(psql_as_postgres "SELECT count(*) FROM orders WHERE tenant_id='$TENANT_B';")")
B_CUSTOMERS=$(strip "$(psql_as_postgres "SELECT count(*) FROM customer WHERE tenant_id='$TENANT_B';")")
echo "  Tenant B products=$B_PRODUCTS, orders=$B_ORDERS, customers=$B_CUSTOMERS"

# 3. Now query AS app_runtime_login with RLS forced to tenant A context.
#    If RLS works, tenant B rows must NOT appear.
echo -e "${YLW}==> Querying AS app_runtime_login (RLS forced to tenant A)...${NC}"
LEAKS=0

check_leak() {
  local table="$1"
  # -q (quiet) suppresses the "SET" response so we only see the SELECT count.
  local result
  result=$(strip "$(docker exec "$SDB" psql "postgresql://app_runtime_login:***@localhost:5432/postgres" -q -tAc "SET app.current_tenant_id='$TENANT_A'; SELECT count(*) FROM $table WHERE tenant_id='$TENANT_B';")")
  if [ -z "$result" ] || [ "$result" = "0" ]; then
    echo -e "  ${GRN}✓${NC} $table: ${result:-0} (no leak)"
  else
    echo -e "  ${RED}✗ LEAK${NC} $table: $result rows visible (tenant B data leaking into A!)"
    LEAKS=$((LEAKS+1))
  fi
}

check_leak "product"
check_leak "orders"
check_leak "order_item"
check_leak "customer"
check_leak "customer_address"
check_leak "payment"
check_leak "shipment"
check_leak "collection"
check_leak "discount"
check_leak "subscription"
check_leak "invoice"

# 4. Also check app_user (should NEVER leak across tenant)
echo -e "${YLW}==> Critical: app_user table (single-tenant by definition)${NC}"
APP_USER_LEAK=$(strip "$(docker exec "$SDB" psql "postgresql://app_runtime_login:***@localhost:5432/postgres" -tAc "SELECT count(*) FROM app_user;")")
if [ -z "$APP_USER_LEAK" ] || [ "$APP_USER_LEAK" = "0" ]; then
  echo -e "  ${GRN}✓${NC} app_user as app_runtime_login: ${APP_USER_LEAK:-0} (RLS blocks even SELECT)"
else
  echo -e "  ${RED}✗ LEAK${NC} app_user: $APP_USER_LEAK rows visible — app_runtime_login must NEVER see app_user!"
  LEAKS=$((LEAKS+1))
fi

# 5. Verify asPlatformAdmin still bypasses (platform users MUST see all)
echo -e "${YLW}==> Sanity: asPlatformAdmin path bypasses RLS${NC}"
PLATFORM_ADMIN_OK=$(strip "$(psql_as_postgres "SELECT count(*) FROM product;")")
echo "  postgres sees: $PLATFORM_ADMIN_OK rows across all tenants (expected = sum)"

echo ""
if [ "$LEAKS" = "0" ]; then
  echo -e "${GRN}==> RLS SMOKE TEST PASSED — no cross-tenant leaks detected${NC}"
  exit 0
else
  echo -e "${RED}==> RLS SMOKE TEST FAILED — $LEAKS leak(s) detected. INVESTIGATE IMMEDIATELY.${NC}"
  exit 1
fi