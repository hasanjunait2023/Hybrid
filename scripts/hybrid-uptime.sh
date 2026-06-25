#!/usr/bin/env bash
# Hybrid Uptime Monitor — checks critical endpoints every N minutes, alerts via Hermes
# Exit codes: 0=ok, 1=degraded, 2=critical (down)
set -uo pipefail

DOMAIN="${HYBRID_DOMAIN:-hybrid.ecomex.cloud}"
TIMEOUT=10
results=()

check() {
  local name="$1" url="$2" expect="$3"
  local code time
  read code time <<<"$(curl -sk --max-time $TIMEOUT -o /dev/null -w '%{http_code} %{time_total}' "$url" 2>&1 || echo '000 0')"
  if [ "$code" = "$expect" ]; then
    echo "OK   $name $url → $code (${time}s)"
    results+=("OK:$name:$code:${time}s")
  else
    echo "FAIL $name $url → $code (expected $expect)"
    results+=("FAIL:$name:$code:${time}s")
  fi
}

# === Critical public endpoints ===
check "marketing_apex" "https://$DOMAIN/" "200"
check "signup_page" "https://$DOMAIN/signup" "200"

# === Tenant storefront (store-a is real test tenant) ===
check "tenant_store_a_home" "https://store-a.$DOMAIN/" "200"

# === Admin (no auth → should redirect to login) ===
check "admin_redirect" "https://admin.$DOMAIN/" "307"

# === CDN (no index → 403 or 404 expected) ===
check "cdn_root" "https://cdn.$DOMAIN/" "403"

# === API health ===
check "api_login_get" "https://$DOMAIN/api/auth/login" "405"
# 405 = method not allowed (only POST), which means the endpoint exists

# === Containers — Status check (not healthcheck, since not all have healthchecks) ===
for c in hybrid-web hybrid-caddy hybrid-postgres hybrid-redis hybrid-jobs; do
  status=$(docker inspect "$c" --format='{{.State.Status}}' 2>/dev/null || echo missing)
  if [ "$status" = "running" ]; then
    echo "OK   container $c status=running"
    results+=("OK:container:$c")
  else
    echo "FAIL container $c status=$status"
    results+=("FAIL:container:$c:$status")
  fi
done

# === Supabase containers (must be running) ===
for c in supabase-kong-pe9o2li2n3bns3wnofob49uw supabase-db-pe9o2li2n3bns3wnofob49uw supabase-auth-pe9o2li2n3bns3wnofob49uw supabase-storage-pe9o2li2n3bns3wnofob49uw supabase-minio-pe9o2li2n3bns3wnofob49uw supabase-rest-pe9o2li2n3bns3wnofob49uw; do
  status=$(docker inspect "$c" --format='{{.State.Status}}' 2>/dev/null || echo missing)
  if [ "$status" = "running" ]; then
    echo "OK   container $c status=running"
    results+=("OK:container:$c")
  else
    echo "FAIL container $c status=$status"
    results+=("FAIL:container:$c:$status")
  fi
done

# Summary
fails=$(printf '%s\n' "${results[@]}" | grep -c '^FAIL' || true)
ok=$(printf '%s\n' "${results[@]}" | grep -c '^OK' || true)
echo ""
echo "=== Summary: $ok OK / $fails FAIL ==="

# Persist last status (skip if no results at all)
if [ ${#results[@]} -gt 0 ]; then
  # Build JSON array safely
  json_arr=""
  for r in "${results[@]}"; do
    IFS=':' read -r status name code rest <<< "$r"
    [ -n "$json_arr" ] && json_arr+=","
    code_esc=$(echo "$code $rest" | sed 's/"/\\"/g')
    json_arr+="{\"status\":\"$status\",\"name\":\"$name\",\"detail\":\"$code_esc\"}"
  done
  cat > /root/backups/UPTIME.json <<EOF
{
  "service": "hybrid-uptime",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "ok_count": $ok,
  "fail_count": $fails,
  "results": [$json_arr]
}
EOF
  chmod 644 /root/backups/UPTIME.json
fi

[ "$fails" -gt 0 ] && exit 1
exit 0