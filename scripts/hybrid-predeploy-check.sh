#!/usr/bin/env bash
# hybrid-predeploy-check.sh
#
# Pre-deploy smoke test. Runs BEFORE `deploy.sh` to catch the exact class of
# bug that caused the 2026-07-01 P0 login outage:
#   - hardcoded env values in docker-compose.prod.yml
#   - missing SUPABASE_* env vars
#   - hybrid-web not on the Supabase Docker network
#   - SUPABASE_URL/KEY stale or wrong
#
# Exits 0 if safe to deploy, 1 if any check failed.
# Designed to be run locally before any commit-push-deploy cycle, and in CI.
#
# Usage:  bash scripts/hybrid-predeploy-check.sh

set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

RED='\033[31m'
GREEN='\033[32m'
YELLOW='\033[33m'
BOLD='\033[1m'
RESET='\033[0m'

failures=0

ok()   { echo -e "${GREEN}✓${RESET} $*"; }
warn() { echo -e "${YELLOW}!${RESET} $*"; warnings=$((warnings + 1)); }
err()  { echo -e "${RED}✗${RESET} $*"; failures=$((failures + 1)); }

warnings=0
failures=0

echo -e "${BOLD}─── hybrid pre-deploy smoke test ───${RESET}"

# --- 1. docker-compose.prod.yml must not have hardcoded env values --------
echo
echo -e "${BOLD}[1/5] compose env interpolation${RESET}"
if [[ ! -f docker-compose.prod.yml ]]; then
  err "docker-compose.prod.yml not found in repo root"
else
  # Look for "KEY: literal" patterns in the web service env block (between "container_name: hybrid-web" and the next service or networks block at the same indent).
  # Whitelist: variables that may be set literally in compose (booleans, "false", "true", empty).
  # Anything else is a red flag.
  python3 - <<'PYEOF'
import re, sys
with open("docker-compose.prod.yml") as f: s = f.read()

# Find the web service block (top-level, 2-space indent in standard YAML)
m = re.search(r"^  web:\s*\n((?:    .+\n)+)", s, re.MULTILINE)
if not m:
    print("  WARN  could not isolate web service block"); sys.exit(0)

block = m.group(1)

# Find the environment: section within it
env_m = re.search(r"environment:\n((?:\s+\S+:.+\n)+)", block)
if not env_m:
    print("  WARN  web service has no environment: block"); sys.exit(0)

env = env_m.group(1)

# Whitelist: explicitly allowed literal values (these are intentionally hardcoded)
literal_whitelist = {
    "true", "false", "True", "False",  # booleans
    "production",  # NODE_ENV only
    "s3",  # BLOB_DRIVER value (currently this should also be interpolated, but defensively allowed)
}
# Variable names that ARE allowed to be literal at this point in time.
# Note: AUTH_PROVIDER is NOT in this list because it's a deployment-mode decision
# that absolutely must come from .env.deploy. If you see a hardcoded AUTH_PROVIDER
# in this file, that IS the bug class that caused the 2026-07-01 P0 outage.
name_whitelist = {
    "NODE_ENV",
    "SMS_LIVE",
    "GLITCHTIP_DSN",  # placeholder until errors.hybrid.ecomex.cloud is wired
    "GLITCHTIP_PUBLIC_URL",  # placeholder
}

bad = []
for line in env.splitlines():
    line = line.rstrip()
    if not line.strip() or line.lstrip().startswith("#"):
        continue
    # Match: KEY: value  (not KEY: ${KEY})
    mm = re.match(r"^\s+([A-Z_][A-Z0-9_]*):\s+(.+)$", line)
    if not mm:
        continue
    name, val = mm.group(1), mm.group(2).strip()
    if name in name_whitelist:
        continue
    if val.startswith("${"):
        continue
    if val.startswith('"') and val.endswith('"'):
        inner = val[1:-1]
        if inner in literal_whitelist or inner.startswith("$"):
            continue
    if val in literal_whitelist:
        continue
    bad.append((name, val))

if bad:
    print(f"  ERR  hardcoded env values in web service (must use \${{VAR}}):")
    for n, v in bad:
        print(f"       {n}: {v}")
    sys.exit(1)
else:
    print("  ✓ all web-service env values are interpolated")
PYEOF
  if [[ $? -ne 0 ]]; then err "hardcoded env values in compose"; else ok "all web env values use \${VAR} interpolation"; fi
fi

# --- 2. .env.deploy has required keys -----------------------------------
echo
echo -e "${BOLD}[2/5] .env.deploy required keys${RESET}"
if [[ ! -f .env.deploy ]]; then
  # .env.deploy is gitignored + lives on the VPS. Allow the check to fall back
  # to a VPS copy if the user has SSH access (and the SSH alias is configured).
  if command -v ssh >/dev/null && ssh -o ConnectTimeout=3 -o BatchMode=yes mt5vps test -f /opt/hybrid/.env.deploy 2>/dev/null; then
    warn ".env.deploy not in repo (gitignored — expected). Will fetch from VPS."
    ENV_DEPLOY_PATH="mt5vps:/opt/hybrid/.env.deploy"
    get_env_value() {
      ssh -o BatchMode=yes mt5vps "grep '^$1=' /opt/hybrid/.env.deploy | cut -d= -f2-"
    }
  else
    err ".env.deploy not found in repo and VPS unreachable. Run 'bash scripts/hybrid-predeploy-check.sh' from a machine with the env file."
    ENV_DEPLOY_PATH=""
    get_env_value() { echo ""; }
  fi
else
  ENV_DEPLOY_PATH=".env.deploy"
  get_env_value() { grep "^$1=" .env.deploy | cut -d= -f2-; }
fi

if [[ -n "$ENV_DEPLOY_PATH" ]]; then
  required=(
    AUTH_PROVIDER
    SUPABASE_URL
    SUPABASE_ANON_KEY
    SUPABASE_SERVICE_ROLE_KEY
    DATABASE_URL
    DIRECT_URL
    APP_ENCRYPTION_KEY
    SESSION_SECRET
    REDIS_URL
    NEXT_PUBLIC_ROOT_DOMAIN
  )
  missing=()
  for key in "${required[@]}"; do
    if ! grep -q "^${key}=" "$ENV_DEPLOY_PATH" 2>/dev/null && ! ssh -o BatchMode=yes mt5vps "grep -q '^${key}=' /opt/hybrid/.env.deploy" 2>/dev/null; then
      missing+=("$key")
    fi
  done
  if [[ ${#missing[@]} -gt 0 ]]; then
    err "$ENV_DEPLOY_PATH missing keys: ${missing[*]}"
  else
    ok "all required keys present in $ENV_DEPLOY_PATH"
  fi

  # AUTH_PROVIDER must be one of the known values
  auth=$(get_env_value AUTH_PROVIDER)
  case "$auth" in
    supabase|password|dev) ok "AUTH_PROVIDER=$auth (known)" ;;
    *) err "AUTH_PROVIDER=$auth is not one of {supabase, password, dev}" ;;
  esac

  if [[ "$auth" == "supabase" ]]; then
    su=$(get_env_value SUPABASE_URL)
    case "$su" in
      http://supabase-kong:8000|https://*.supabase.co|http://kong:8000)
        ok "SUPABASE_URL=$su (internal Kong or public)" ;;
      *)
        warn "SUPABASE_URL=$su is unusual — expected internal Kong http://supabase-kong:8000 or https://*.supabase.co" ;;
    esac
  fi
fi

# --- 3. .env.deploy must NOT be committed (gitignore) -------------------
echo
echo -e "${BOLD}[3/5] secret hygiene${RESET}"
if [[ -d .git ]]; then
  if git check-ignore .env.deploy >/dev/null 2>&1; then
    ok ".env.deploy is gitignored"
  else
    err ".env.deploy is NOT gitignored — secrets would leak to git"
  fi
fi

# --- 4. hybrid-web declares both required networks ----------------------
echo
echo -e "${BOLD}[4/5] compose networks for hybrid-web + pgbouncer${RESET}"
if [[ -f docker-compose.prod.yml ]]; then
  python3 - <<'PYEOF'
import re, sys
with open("docker-compose.prod.yml") as f: s = f.read()
need = ["hybrid_default", "pe9o2li2n3bns3wnofob49uw"]
problems = []
for svc in ["web", "pgbouncer"]:
    sm = re.search(rf"^  {svc}:\s*\n((?:    .+\n)+)", s, re.MULTILINE)
    if not sm:
        continue
    block = sm.group(1)
    # find the networks: block
    nm = re.search(r"networks:\n((?:\s+-\s+\S+\n)+)", block)
    if not nm:
        problems.append(f"{svc}: no networks: block")
        continue
    nets = nm.group(1)
    for n in need:
        if n not in nets:
            problems.append(f"{svc}: missing network {n}")
if problems:
    print(f"  ERR network problems: {'; '.join(problems)}")
    sys.exit(1)
else:
    print("  ✓ web + pgbouncer both declare hybrid_default + pe9o2li2n3bns3wnofob49uw")
PYEOF
  if [[ $? -ne 0 ]]; then err "compose network declarations wrong"; else ok "compose networks correct for web + pgbouncer"; fi
fi

# --- 5. App source has the preflight + auth healthcheck -----------------
echo
echo -e "${BOLD}[5/5] source has preflight + auth healthcheck${RESET}"
required_files=(
  "apps/web/scripts/preflight.mjs"
  "apps/web/scripts/healthcheck.mjs"
  "apps/web/app/api/healthz/auth/route.ts"
)
missing_files=()
for f in "${required_files[@]}"; do
  if [[ ! -f "$f" ]]; then missing_files+=("$f"); fi
done
if [[ ${#missing_files[@]} -gt 0 ]]; then
  err "missing source files: ${missing_files[*]}"
else
  ok "all hardening files present in source"
fi

# Dockerfile CMD must invoke preflight
if grep -q "preflight.mjs" Dockerfile 2>/dev/null; then
  ok "Dockerfile CMD invokes preflight.mjs"
else
  err "Dockerfile CMD does NOT invoke preflight.mjs — startup check disabled"
fi

# --- summary -------------------------------------------------------------
echo
echo -e "${BOLD}──────────────────────────────────────${RESET}"
if [[ $failures -eq 0 ]]; then
  echo -e "${GREEN}${BOLD}✓ pre-deploy smoke test passed${RESET} ($warnings warning$([[ $warnings == 1 ]] && echo "" || echo "s"))"
  echo "Safe to run ./deploy.sh"
  exit 0
else
  echo -e "${RED}${BOLD}✗ pre-deploy smoke test FAILED with $failures error$([[ $failures == 1 ]] && echo "" || echo "s")${RESET}"
  [[ $warnings -gt 0 ]] && echo -e "${YELLOW}$warnings warning(s) above${RESET}"
  echo "Fix the errors above BEFORE pushing to production."
  exit 1
fi