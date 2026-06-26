#!/usr/bin/env bash
# Hybrid Backup Monitor — scrapes VPS STATUS.json via SSH, alerts if stale.
# Run from local Hermes host, e.g. every hour via cron.
# Exits 1 if backup is stale (>24h since last dump) or R2 sync failed.
set -euo pipefail

VPS="hostinger"
STATUS_REMOTE="/root/backups/STATUS.json"
MAX_AGE_HOURS=24

STATUS_JSON=$(ssh -o ConnectTimeout=10 "$VPS" "cat $STATUS_REMOTE 2>/dev/null") || {
  echo "ERROR: cannot ssh to $VPS or file missing"
  exit 2
}

python3 <<PY
import json, datetime
d = json.loads('''$STATUS_JSON'''.replace("'", "'\\''"))
latest = d.get("local", {}).get("latest_mtime", "")
if not latest:
    print("ERROR: no local dumps")
    raise SystemExit(1)
mtime = datetime.datetime.strptime(latest, "%Y-%m-%d %H:%M:%S")
age_h = (datetime.datetime.now() - mtime).total_seconds() / 3600
r2 = d.get("r2", {}).get("status", "unknown")
print(f"service={d.get('service')} | local_dumps={d['local']['dumps_count']} | size={d['local']['total_size']} | age={age_h:.1f}h | r2={r2}")
if age_h > $MAX_AGE_HOURS:
    print(f"ALERT: backup is {age_h:.1f}h old (max {$MAX_AGE_HOURS}h)")
    raise SystemExit(1)
if r2 != "ok":
    print(f"ALERT: R2 sync failed: {r2}")
    raise SystemExit(1)
print("OK")
PY