#!/usr/bin/env bash
# CI guard — fail the build if any up migration is missing its down file.
#
# Convention:
#   packages/db/sql/NN_<name>.sql              ← up
#   packages/db/sql/down/NN_<name>.down.sql    ← down
#
# Legacy files (00_roles, 01_schema, 02_policies, 03_seed, 04_grant_login,
# 06_own_auth, 07_phase2, 08_perf_indexes) are EXEMPT — they're the
# bootstrap layer that defines the RLS system itself, so rolling them back
# would corrupt the DB. Everything from 09 onward MUST have a down.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SQL_DIR="$SCRIPT_DIR/../sql"
DOWN_DIR="$SQL_DIR/down"

EXEMPT=(
  "00_roles"
  "01_schema"
  "02_policies"
  "03_seed"
  "04_grant_login"
  "06_own_auth"
  "07_phase2"
  "08_perf_indexes"
)

MISSING=0
for up in "$SQL_DIR"/*.sql; do
  name=$(basename "$up" .sql)
  # skip the down dir
  if [[ "$name" == *.down ]]; then continue; fi

  # check exemption
  skip=0
  for ex in "${EXEMPT[@]}"; do
    if [ "$name" = "$ex" ]; then skip=1; break; fi
  done
  if [ "$skip" = "1" ]; then continue; fi

  down="$DOWN_DIR/${name}.down.sql"
  if [ ! -f "$down" ]; then
    echo "MISSING ROLLBACK: $up"
    echo "  expected: $down"
    MISSING=$((MISSING + 1))
  fi
done

if [ "$MISSING" -gt 0 ]; then
  echo
  echo "ERROR: $MISSING up migration(s) without a .down.sql partner."
  echo "Migrations from 09 onward MUST have a matching down file."
  exit 1
fi

echo "All post-08 migrations have rollback files. ✅"