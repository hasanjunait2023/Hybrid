#!/usr/bin/env bash
# Cloudflare Cache Rules — storefront edge caching (Phase A).
# NOT YET APPLIED — needs CF_API_TOKEN (Zone:Cache Rules edit + Cache Purge) + CF_ZONE_ID.
#
# WHY override-origin: the storefront origin (Next.js) emits `Cache-Control:
# no-store` because the pages are unbounded multi-tenant dynamic routes
# (/[tenant]/...). They CANNOT be safely made static at the origin (one tenant's
# HTML must never be served to another). So the EDGE does the HTML caching, with
# an explicit override-origin Edge TTL + a cache key that includes the Host, and
# hard bypass for anything user/seller-specific (session cookie, cart/checkout/
# order/account/api/admin). Per-tenant freshness on edit comes from cloudflare-
# purge.sh (purge by Cache-Tag `tenant:{id}`), driven by the app's existing
# revalidateTag scheme.
#
# Uses the Rulesets API (phase entrypoint PUT = idempotent: re-running replaces
# the cache-phase rules, so this is safe to run repeatedly).
set -euo pipefail

CF_API_TOKEN="${CF_API_TOKEN:?set CF_API_TOKEN (Zone:Cache Rules edit + Cache Purge)}"
CF_ZONE_ID="${CF_ZONE_ID:?set CF_ZONE_ID (zone for hybrid.ecomex.cloud)}"

API="https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/rulesets/phases/http_request_cache_settings/entrypoint"

# Storefront host = "<sub>.hybrid.ecomex.cloud" EXCEPT admin/app/cdn/www and the apex.
# Bypass cache for: logged-in sessions (hybrid_session cookie) and dynamic paths.
# NOTE: Free/Pro plans only allow basic operators (eq/ne/contains/in/wildcard).
# `matches` (regex) and `ends_with` need Business/WAF-Advanced — do NOT use them.
# host `contains ".hybrid.ecomex.cloud"` matches the 2-level storefront subdomains
# and naturally excludes the apex (no leading dot); we still exclude admin/app/cdn/www.
# Paths use wildcard (basic-plan ok) to bypass dynamic/auth routes.
STOREFRONT_EXPR='(http.host contains ".hybrid.ecomex.cloud")
  and not (http.host in {"admin.hybrid.ecomex.cloud" "app.hybrid.ecomex.cloud" "cdn.hybrid.ecomex.cloud" "www.hybrid.ecomex.cloud"})
  and not (http.cookie contains "hybrid_session=")
  and not (http.request.uri.path wildcard "/cart*") and not (http.request.uri.path wildcard "/checkout*")
  and not (http.request.uri.path wildcard "/order*") and not (http.request.uri.path wildcard "/account*")
  and not (http.request.uri.path wildcard "/api*") and not (http.request.uri.path wildcard "/admin*")
  and not (http.request.uri.path wildcard "/login*") and not (http.request.uri.path wildcard "/dev-login*")'

CDN_EXPR='(http.host eq "cdn.hybrid.ecomex.cloud")'

# Collapse the multi-line expression to one line for JSON.
STOREFRONT_EXPR_ONELINE=$(printf '%s' "$STOREFRONT_EXPR" | tr -s '[:space:]' ' ')

read -r -d '' BODY <<JSON || true
{
  "rules": [
    {
      "description": "Storefront HTML — edge cache 60s, override origin no-store, Host in cache key, bypass sessions/dynamic",
      "expression": "${STOREFRONT_EXPR_ONELINE}",
      "action": "set_cache_settings",
      "action_parameters": {
        "cache": true,
        "edge_ttl": { "mode": "override_origin", "default": 60 },
        "browser_ttl": { "mode": "override_origin", "default": 0 }
      }
    },
    {
      "description": "CDN images (MinIO) — immutable, 1 year edge + browser",
      "expression": "${CDN_EXPR}",
      "action": "set_cache_settings",
      "action_parameters": {
        "cache": true,
        "edge_ttl": { "mode": "override_origin", "default": 31536000 },
        "browser_ttl": { "mode": "override_origin", "default": 31536000 }
      }
    }
  ]
}
JSON

echo "Applying cache ruleset to zone ${CF_ZONE_ID} ..."
curl -fsS -X PUT "$API" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data "$BODY" | { command -v jq >/dev/null && jq '{success, errors, result_rules: (.result.rules | length)}' || cat; }

echo
echo "Done. Verify: Cloudflare dashboard -> Caching -> Cache Rules."
echo "Test:   curl -sI https://store-a.hybrid.ecomex.cloud/products | grep -i cf-cache-status"
echo "        (expect cf-cache-status: MISS then HIT on a 2nd request)"
echo "Purge a tenant after edits:  CF_API_TOKEN=... CF_ZONE_ID=... TENANT_ID=<uuid> bash infra/cloudflare/cloudflare-purge.sh"
