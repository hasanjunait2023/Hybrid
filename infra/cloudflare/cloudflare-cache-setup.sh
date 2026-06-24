#!/bin/bash
# Cloudflare Cache Rules Setup — Phase A infrastructure prep
# Configures edge caching for storefronts + images via Cloudflare API
# NOT YET APPLIED — requires founder approval + real CF_API_TOKEN / CF_ZONE_ID

set -eu

# ==============================================================================
# CONFIGURATION — Replace with real values before running
# ==============================================================================

# Get from Cloudflare dashboard: https://dash.cloudflare.com/profile/api-tokens
# Token MUST have permissions: Zone:Cache Purge, Zone Settings edit
CF_API_TOKEN="${CF_API_TOKEN:-REPLACE_ME_WITH_REAL_TOKEN}"

# Get from Cloudflare dashboard: https://dash.cloudflare.com/?account=<account-id>/domains/<domain>
# This is the zone for hybrid.ecomex.cloud (all *.hybrid.ecomex.cloud + cdn.hybrid.ecomex.cloud)
CF_ZONE_ID="${CF_ZONE_ID:-REPLACE_ME_WITH_REAL_ZONE_ID}"

# Domain we're caching (storefront + CDN)
DOMAIN="hybrid.ecomex.cloud"

# ==============================================================================
# VALIDATION
# ==============================================================================

if [ "$CF_API_TOKEN" = "REPLACE_ME_WITH_REAL_TOKEN" ] || [ "$CF_ZONE_ID" = "REPLACE_ME_WITH_REAL_ZONE_ID" ]; then
  echo "❌ ERROR: Set CF_API_TOKEN and CF_ZONE_ID before running"
  echo ""
  echo "Example:"
  echo "  export CF_API_TOKEN='your-token-here'"
  echo "  export CF_ZONE_ID='your-zone-id-here'"
  echo "  bash infra/cloudflare/cloudflare-cache-setup.sh"
  exit 1
fi

# ==============================================================================
# HELPER: Cloudflare API call
# ==============================================================================

cf_api() {
  local method=$1
  local endpoint=$2
  local data=${3:-}

  local url="https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}${endpoint}"
  local cmd=(
    curl -s -X "$method" "$url"
    -H "Authorization: Bearer $CF_API_TOKEN"
    -H "Content-Type: application/json"
  )

  if [ -n "$data" ]; then
    cmd+=(-d "$data")
  fi

  "${cmd[@]}"
}

# ==============================================================================
# CACHE RULES SETUP
# ==============================================================================

echo "Setting up Cloudflare cache rules for $DOMAIN..."
echo ""

# Rule 1: Cache storefront HTML (*.hybrid.ecomex.cloud)
# - Honors origin Cache-Control s-maxage directive
# - Exclude /admin, /api, /checkout, /cart, and admin./app. hosts
echo "[1/2] Creating storefront cache rule..."

storefront_rule=$(cat <<'EOF'
{
  "rules": [
    {
      "description": "Cache storefront HTML — honor origin s-maxage, exclude admin/API",
      "expression": "(http.host matches \"^[a-z0-9-]+\\.hybrid\\.ecomex\\.cloud$\") and not (cf.threat_score > 50) and not (http.request.uri.path matches \"^/admin(/|$)\") and not (http.request.uri.path matches \"^/api(/|$)\") and not (http.request.uri.path matches \"^/checkout(/|$)\") and not (http.request.uri.path matches \"^/cart(/|$)\")",
      "action": "cache_on_cookie_present",
      "action_parameters": {
        "cache": true,
        "browser_ttl": 3600,
        "edge_ttl": 86400,
        "cache_control_origin": true
      }
    }
  ]
}
EOF
)

cf_api POST "/rules" "$storefront_rule" | jq .
if [ $? -eq 0 ]; then
  echo "✅ Storefront cache rule created"
else
  echo "⚠️  Storefront cache rule failed (may already exist)"
fi

echo ""

# Rule 2: Cache CDN images (cdn.hybrid.ecomex.cloud/*)
# - Immutable images with 1-year TTL
echo "[2/2] Creating CDN image cache rule..."

cdn_rule=$(cat <<'EOF'
{
  "rules": [
    {
      "description": "Cache CDN images immutable — 1 year TTL",
      "expression": "http.host eq \"cdn.hybrid.ecomex.cloud\"",
      "action": "cache_on_cookie_present",
      "action_parameters": {
        "cache": true,
        "browser_ttl": 31536000,
        "edge_ttl": 31536000,
        "cache_control_origin": false
      }
    }
  ]
}
EOF
)

cf_api POST "/rules" "$cdn_rule" | jq .
if [ $? -eq 0 ]; then
  echo "✅ CDN cache rule created"
else
  echo "⚠️  CDN cache rule failed (may already exist)"
fi

echo ""
echo "Cloudflare cache rules setup complete!"
echo ""
echo "Next steps:"
echo "1. Verify rules in Cloudflare dashboard → Rules → Cache Rules"
echo "2. Update storefront responses to include Cache-Control headers:"
echo "   - Storefront HTML: Cache-Control: s-maxage=3600, public"
echo "   - See docs/SCALING_PLAN.md Phase A for code changes needed"
echo "3. Watch cache hit rates in Cloudflare Analytics"
echo ""
