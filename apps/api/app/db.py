"""Async DB layer — asyncpg pool + the RLS contract.

THE GOLDEN RULE (mirrors @hybrid/db withTenant.ts): every tenant query runs
inside a transaction that first sets the request-scoped GUCs with
`set_config(..., true)` (transaction-local: cleared on COMMIT/ROLLBACK, never
leaks across pooled connections). The pool connects as `app_runtime_login`
(DATABASE_URL — non-superuser) so RLS is FORCED; the GUCs are what the policies
filter on. `statement_cache_size=0` mirrors postgres.js `prepare:false`, required
under transaction-mode poolers.

Use `with_tenant(tenant_id)` for tenant-scoped work and `as_platform_admin()` for
cross-tenant enumeration (sets app.is_platform_admin=true, which the policies honor).
NEVER run tenant queries on a raw `pool.acquire()` without these — that bypasses
the GUCs the policies depend on.
"""
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import asyncpg

from .config import get_settings

_pool: asyncpg.Pool | None = None


async def init_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        s = get_settings()
        _pool = await asyncpg.create_pool(
            dsn=s.database_url,
            min_size=s.db_pool_min,
            max_size=s.db_pool_max,
            statement_cache_size=0,  # == postgres.js prepare:false (pooler-safe)
        )
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("db pool not initialized (call init_pool in lifespan)")
    return _pool


@asynccontextmanager
async def with_tenant(
    tenant_id: str, user_id: str | None = None
) -> AsyncIterator[asyncpg.Connection]:
    """Run queries with the tenant RLS context set. RLS is FORCED for this role."""
    async with get_pool().acquire() as conn:
        async with conn.transaction():
            await conn.execute("SELECT set_config('app.current_tenant_id', $1, true)", tenant_id)
            await conn.execute("SELECT set_config('app.current_user_id', $1, true)", user_id or "")
            await conn.execute("SELECT set_config('app.is_platform_admin', 'false', true)")
            yield conn


@asynccontextmanager
async def as_platform_admin() -> AsyncIterator[asyncpg.Connection]:
    """Cross-tenant context (app.is_platform_admin() → true). Use for enumeration
    that spans tenants (e.g. 'which tenants have shipments to sync'), never for
    per-tenant writes — those go back through with_tenant()."""
    async with get_pool().acquire() as conn:
        async with conn.transaction():
            await conn.execute("SELECT set_config('app.current_tenant_id', '', true)")
            await conn.execute("SELECT set_config('app.current_user_id', '', true)")
            await conn.execute("SELECT set_config('app.is_platform_admin', 'true', true)")
            yield conn
