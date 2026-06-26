#!/usr/bin/env bash
# Hybrid — Backup Status Writer
# Writes the latest backup status to /root/backups/STATUS.json for monitoring
# systems (Hermes T2 watchdog, GlitchTip, etc.) to scrape.
# Usage: hybrid-backup-status  (called by hybrid-backup.sh)
set -euo pipefail

DIR=/root/backups
STATUS="$DIR/STATUS.json"
TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Count dumps + compute total size + most recent
TOTAL_DUMPS=$(ls -1 "$DIR"/db-*.sql.gz 2>/dev/null | wc -l)
TOTAL_SIZE=$(du -sh "$DIR" 2>/dev/null | cut -f1)
LATEST_LOCAL=$(ls -t "$DIR"/db-*.sql.gz 2>/dev/null | head -1 | xargs -n1 basename 2>/dev/null || echo "")
LATEST_MTIME=$(stat -c '%y' "$DIR/$LATEST_LOCAL" 2>/dev/null | cut -d. -f1 || echo "")

# Check R2
R2_STATUS="unknown"
R2_LATEST=""
if [ -f /root/.r2-backup.env ]; then
  . /root/.r2-backup.env
  rtmp=$(mktemp); chmod 600 "$rtmp"
  host=${R2_ENDPOINT#https://}
  printf 'MC_HOST_r2=https://%s:%s@%s\n' \
    "$(python3 -c 'import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=""))' "$R2_ACCESS_KEY")" \
    "$(python3 -c 'import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=""))' "$R2_SECRET_KEY")" \
    "$host" > "$rtmp"
  if R2_OUT=$(docker run --rm --env-file "$rtmp" minio/mc ls --recursive "r2/$R2_BUCKET/" 2>&1); then
    R2_STATUS="ok"
    R2_LATEST=$(echo "$R2_OUT" | sort -k1,2 -r | head -1 | awk '{print $NF}')
    R2_COUNT=$(echo "$R2_OUT" | wc -l)
  else
    R2_STATUS="error: $R2_OUT"
  fi
  rm -f "$rtmp"
fi

# Write JSON
cat > "$STATUS" <<EOF
{
  "service": "hybrid-backup",
  "timestamp": "$TS",
  "local": {
    "dumps_count": $TOTAL_DUMPS,
    "total_size": "$TOTAL_SIZE",
    "latest": "$LATEST_LOCAL",
    "latest_mtime": "$LATEST_MTIME"
  },
  "r2": {
    "status": "$R2_STATUS",
    "latest": "$R2_LATEST",
    "endpoint": "${R2_ENDPOINT:-}"
  }
}
EOF

chmod 644 "$STATUS"
echo "[backup-status] written $STATUS"