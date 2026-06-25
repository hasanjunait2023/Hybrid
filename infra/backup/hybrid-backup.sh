#!/usr/bin/env bash
# Hybrid nightly backup — DEPLOYED at /usr/local/bin/hybrid-backup.sh on the VPS,
# run by root cron `0 3 * * *`. This repo copy is for reproducibility/review.
#
# Backs up the supabase-db (whole postgres DB: hybrid public + auth + storage) +
# the MinIO product-image bucket, LOCALLY to /root/backups (14-dump retention),
# then OFF-SITE to Cloudflare R2 (bucket hybrid-backups) via `mc mirror`.
#
# Secrets are NOT in this file. R2 creds live ONLY in /root/.r2-backup.env (chmod
# 600) on the VPS: R2_ENDPOINT / R2_ACCESS_KEY / R2_SECRET_KEY / R2_BUCKET.
# If that file is absent, the off-site step is skipped (local backup still runs).
#
# Restore (DB):  gunzip -c db-<ts>.sql.gz | docker exec -i supabase-db-... psql -U postgres -d postgres
set -euo pipefail
TS=$(date +%Y%m%d-%H%M%S)
DIR=/root/backups
SDB=supabase-db-pe9o2li2n3bns3wnofob49uw
MINIO=supabase-minio-pe9o2li2n3bns3wnofob49uw
NET=pe9o2li2n3bns3wnofob49uw
mkdir -p "$DIR/minio"

# 1. DB dump
docker exec "$SDB" pg_dump -U postgres -d postgres | gzip > "$DIR/db-$TS.sql.gz"

# 2. MinIO product images mirror (local)
U=$(docker exec "$MINIO" printenv MINIO_ROOT_USER)
P=$(docker exec "$MINIO" printenv MINIO_ROOT_PASSWORD)
ENCU=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=''))" "$U")
ENCP=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=''))" "$P")
docker run --rm --network "$NET" -v "$DIR/minio":/data -e MC_HOST_m="http://$ENCU:$ENCP@supabase-minio:9000" \
  minio/mc mirror --overwrite --remove m/hybrid-media /data/hybrid-media >/dev/null 2>&1 || echo "[backup] minio mirror skipped"

# 3. local retention: keep newest 14 DB dumps
ls -1t "$DIR"/db-*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm -f

# 4. OFF-SITE: mirror local backup dir to Cloudflare R2 (if configured)
if [ -f /root/.r2-backup.env ]; then
  set -a; . /root/.r2-backup.env; set +a
  if docker run --rm -v "$DIR":/backups \
       -e EP="$R2_ENDPOINT" -e AK="$R2_ACCESS_KEY" -e SK="$R2_SECRET_KEY" -e BK="$R2_BUCKET" \
       --entrypoint /bin/sh minio/mc -c '
         mc alias set r2 "$EP" "$AK" "$SK" --api S3v4 >/dev/null 2>&1
         mc mirror --overwrite --remove /backups r2/"$BK"
       ' >/dev/null 2>&1; then
    echo "[backup] off-site -> R2/$R2_BUCKET OK"
  else
    echo "[backup] R2 push FAILED"
  fi
fi
echo "[backup] $TS ok — db=$(du -h "$DIR/db-$TS.sql.gz" | cut -f1)"
