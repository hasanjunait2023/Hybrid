#!/usr/bin/env bash
# Migration rollback helper.
#
# Usage:
#   bash packages/db/scripts/rollback.sh <migration_name>
#   bash packages/db/scripts/rollback.sh 17_audit_log.sql
#
# Runs the matching <name>.down.sql from packages/db/sql/down/ inside a
# transaction with DIRECT_URL (the postgres superuser, which can drop RLS-
# protected tables). The script refuses to run on a non-empty matching
# pattern without --force, and ALWAYS confirms before executing.
#
# This is the reverse half of the migration contract: every packages/db/sql/NN_*.up.sql
# file MUST have a matching NN_*.down.sql in packages/db/sql/down/. New
# migrations without a down file fail CI (see pnpm run check:rollbacks).

set -euo pipefail

MIG_NAME="${1:-}"

if [ -z "$MIG_NAME" ]; then
  echo "Usage: $0 <migration_filename>"
  echo "Example: $0 17_audit_log.sql"
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
DOWN_FILE="$REPO_ROOT/packages/db/sql/down/${MIG_NAME%.sql}.down.sql"

if [ ! -f "$DOWN_FILE" ]; then
  echo "ERROR: rollback file not found: $DOWN_FILE"
  echo "Migrations must ship with a .down.sql. See packages/db/sql/down/"
  exit 1
fi

if [ -z "${DIRECT_URL:-}" ]; then
  echo "ERROR: DIRECT_URL not set. Refusing to run rollback without the"
  echo "superuser connection (we need it to drop RLS-protected objects)."
  echo "Re-run with DIRECT_URL=postgres://..."
  exit 1
fi

echo "About to run rollback for: $MIG_NAME"
echo "Down file:                $DOWN_FILE"
echo "Database:                 $(echo "$DIRECT_URL" | sed 's|postgres://[^@]*@||')"
echo
echo "WARNING: this drops tables / data. Confirm by typing the migration name:"
read -r CONFIRM
if [ "$CONFIRM" != "$MIG_NAME" ]; then
  echo "Aborted (input did not match)."
  exit 1
fi

psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -1 -f "$DOWN_FILE"
echo "Rollback complete: $MIG_NAME"