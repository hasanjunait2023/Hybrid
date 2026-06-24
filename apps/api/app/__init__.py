"""Hybrid async jobs service (FastAPI).

Heavy / background jobs for the Hybrid commerce platform — courier status sync,
COD reconciliation — that don't belong in the Next.js request path. Connects to
the SAME self-hosted Supabase Postgres as the web app and honors the SAME RLS
discipline (see app.db: with_tenant / as_platform_admin mirror @hybrid/db).
"""

__version__ = "0.1.0"
