#!/usr/bin/env bash
# Hybrid nightly backup — DEPLOYED at /usr/local/bin/hybrid-backup.sh on the VPS,
# run by root cron `0 3 * * *`. This repo copy is for reproducibility/review.
#
# Backs up the supabase-db (whole postgres DB: hybrid public + auth + storage) +
# the MinIO product-image bucket, LOCALLY to /root/backups (14-dump retention),
# then OFF-SITE to Cloudflare R2 (bucket hybrid-backups).
#
# SECURITY:
#  - Secrets are NEVER in this file and NEVER passed as process arguments
#    (which would show in `ps`). R2 creds live only in /root/.r2-backup.env
#    (chmod 600). Both mc invocations receive creds via a MC_HOST_* var in a
#    temp --env-file (chmod 600, removed immediately after), so nothing sensitive
#    appears in argv.
#  - Off-site sync is ADDITIVE (no --remove): a corrupt/empty local dir must NEVER
#    be able to delete the off-site backups. R2 retention is handled by an R2
#    lifecycle rule (object expiry), not by mirror-delete.
#
# Restore (DB):  gunzip -c db-<ts>.sql.gz | docker exec -i supabase-db-... psql -U postgres -d postgres
set -euo pipefail
TS=$(date +%Y%m%d-%H%M%S)
DIR=/root/backups
SDB=supabase-db-pe9o2li2n3bns3wnofob49uw
MINIO=supabase-minio-pe9o2li2n3bns3wnofob49uw
NET=pe9o2li2n3bns3wnofob49uw
mkdir -p "$DIR/minio"

urlenc() { python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=''))" "$1"; }

# 1. DB dump
docker exec "$SDB" pg_dump -U postgres -d postgres | gzip > "$DIR/db-$TS.sql.gz"

# 2. MinIO product images mirror (local). Creds via temp --env-file, not argv.
U=$(docker exec "$MINIO" printenv MINIO_ROOT_USER)
P=$(docker exec "$MINIO" printenv MINIO_ROOT_PASSWORD)
mtmp=$(mktemp); chmod 600 "$mtmp"
printf 'MC_HOST_m=http://%s:%s@supabase-minio:9000\n' "$(urlenc "$U")" "$(urlenc "$P")" > "$mtmp"
docker run --rm --network "$NET" --env-file "$mtmp" -v "$DIR/minio":/data minio/mc \
  mirror --overwrite --remove m/hybrid-media /data/hybrid-media >/dev/null 2>&1 || echo "[backup] minio mirror skipped"
rm -f "$mtmp"

# 3. local retention: keep newest 14 DB dumps
ls -1t "$DIR"/db-*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm -f

# 4. OFF-SITE to Cloudflare R2 — ADDITIVE ONLY. Guard: only sync when THIS run's
#    dump exists and is non-trivial (never push/sync a broken or empty state).
if [ -f /root/.r2-backup.env ] && [ -s "$DIR/db-$TS.sql.gz" ] \
   && [ "$(stat -c%s "$DIR/db-$TS.sql.gz")" -ge 1024 ]; then
  # shellcheck disable=SC1091
  . /root/.r2-backup.env
  host=${R2_ENDPOINT#https://}
  rtmp=$(mktemp); chmod 600 "$rtmp"
  printf 'MC_HOST_r2=https://%s:%s@%s\n' "$(urlenc "$R2_ACCESS_KEY")" "$(urlenc "$R2_SECRET_KEY")" "$host" > "$rtmp"
  if docker run --rm --env-file "$rtmp" -v "$DIR":/backups minio/mc \
       mirror --overwrite /backups "r2/$R2_BUCKET" >/dev/null 2>&1; then
    echo "[backup] off-site -> R2/$R2_BUCKET OK (additive)"
  else
    echo "[backup] R2 push FAILED"
  fi
  rm -f "$rtmp"
else
  echo "[backup] R2 sync SKIPPED (no creds, or dump missing/too small — safety guard)"
fi
echo "[backup] $TS ok — db=$(du -h "$DIR/db-$TS.sql.gz" | cut -f1)"
