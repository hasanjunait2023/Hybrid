#!/bin/bash
# Cloudflare Cache Purge by Cache-Tag — Phase A infrastructure prep
# Purges the edge cache when a storefront/product is updated
#
# This script is the BACK-HALF of per-tenant cache invalidation.
# The FRONT-HALF is code changes: app calls this after revalidateTag()
#
# NOT YET APPLIED — requires founder approval + CF_API_TOKEN / CF_ZONE_ID

set -eu

# ==============================================================================
# CONFIGURATION
# ==============================================================================

CF_API_TOKEN="${CF_API_TOKEN:-REPLACE_ME_WITH_REAL_TOKEN}"
CF_ZONE_ID="${CF_ZONE_ID:-REPLACE_ME_WITH_REAL_ZONE_ID}"

# ==============================================================================
# USAGE & VALIDATION
# ==============================================================================

usage() {
  cat <<EOF
Usage: cloudflare-purge.sh <cache-tag> [cache-tag2] [...]

Purges Cloudflare edge cache by Cache-Tag.

Examples:
  # Purge a single tenant's storefront
  cloudflare-purge.sh "tenant:abc123:products"

  # Purge multiple tags at once
  cloudflare-purge.sh "tenant:abc123:products" "tenant:abc123:orders"

Environment variables:
  CF_API_TOKEN  — Cloudflare API token (Zone:Cache Purge)
  CF_ZONE_ID    — Cloudflare zone ID for hybrid.ecomex.cloud

Set these in .env.deploy before calling:
  export CF_API_TOKEN='your-token'
  export CF_ZONE_ID='your-zone-id'

EOF
  exit 1
}

if [ $# -eq 0 ]; then
  echo "❌ ERROR: At least one cache tag required"
  usage
fi

if [ "$CF_API_TOKEN" = "REPLACE_ME_WITH_REAL_TOKEN" ] || [ "$CF_ZONE_ID" = "REPLACE_ME_WITH_REAL_ZONE_ID" ]; then
  echo "❌ ERROR: Set CF_API_TOKEN and CF_ZONE_ID as environment variables"
  usage
fi

# ==============================================================================
# PURGE
# ==============================================================================

echo "🗑️  Purging Cloudflare cache by tag..."
echo ""

# Collect all tags into an array
tags=()
for tag in "$@"; do
  tags+=("$tag")
  echo "  Tag: $tag"
done

echo ""

# Call Cloudflare purge API
purge_payload=$(cat <<EOF
{
  "files": [],
  "tags": [$(printf '"%s", ' "${tags[@]}" | sed 's/, $//' )]
}
EOF
)

echo "Calling Cloudflare API..."
response=$(curl -s -X POST \
  "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/purge_cache" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$purge_payload")

echo "$response" | jq .

# Check success
success=$(echo "$response" | jq -r '.success')
if [ "$success" = "true" ]; then
  echo ""
  echo "✅ Cache purge initiated for ${#tags[@]} tag(s)"
else
  echo ""
  echo "❌ Cache purge failed. Check your API token and zone ID."
  echo "Response: $response"
  exit 1
fi
