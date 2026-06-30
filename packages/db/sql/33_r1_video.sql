-- ============================================================================
-- 33_r1_video.sql — Product videos (Sprint-1 R1).
-- Merchant uploads short MP4/WebM clips (≤50MB) to the existing R2/MinIO
-- hybrid-media bucket. Each clip is paired with a poster image so the PDP can
-- render a thumbnail-only HTML5 <video> element (the browser never auto-plays
-- and never downloads the byte-stream until the buyer taps play — critical on
-- 3G BD).
--
-- Same isolation contract as every other tenant-scoped table: RLS enabled +
-- FORCED, policy keyed on app.current_tenant_id(). Idempotent so re-runs are
-- safe (migrate.ts ledger-tracks by prefix and runs this once, after 32).
--
-- Design notes:
--   * url + poster_url are opaque blob refs returned by the existing
--     BlobStore (S3BlobStore / LocalBlobStore). They survive R2 / MinIO bucket
--     switches because no code reads the URL — only stores it.
--   * position is dense (0..n) — reorder = rewrite position in one UPDATE.
--   * duration_seconds is optional metadata extracted client-side via
--     HTMLMediaElement.duration (so we can later filter "video only" carousels
--     without re-fetching the byte stream).
--   * No file-type polymorphism: the URL is stored as the public, opaque
--     string the upload route already returns.
-- ============================================================================

create table if not exists product_video (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenant(id) on delete cascade,
  product_id       uuid not null references product(id) on delete cascade,
  url              text not null,
  poster_url       text,
  title            text,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  position         integer not null default 0,
  created_at       timestamptz not null default now()
);

create index if not exists product_video_product_idx
  on product_video (product_id, position);

-- ---- RLS: identical isolation contract as 02_policies.sql §2 ----------------
do $$
declare t text := 'product_video';
begin
  if not exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = t
  ) then
    -- Table already exists; this branch is a no-op but keeps the helper
    -- idempotent for an operator re-running just this file.
    return;
  end if;
  execute format('alter table %I enable row level security;', t);
  execute format('alter table %I force row level security;', t);
  if not exists (
    select 1 from pg_policies where tablename = t and policyname = t || '_isolation'
  ) then
    execute format($f$
      create policy %1$I_isolation on %1$I
        using (tenant_id = app.current_tenant_id() or app.is_platform_admin())
        with check (tenant_id = app.current_tenant_id() or app.is_platform_admin());
    $f$, t);
  end if;
  grant select, insert, update, delete on product_video to app_runtime;
end $$;

-- ---- Register product_video in the canonical tenant-table list --------------
-- 02_policies.sql hard-codes the tenant_tables array so the policy loop runs at
-- install time. For a migration applied AFTER initial install, we must add the
-- table to that policy contract here (idempotent: re-checking
-- pg_policies.{tablename,policyname} guards the if-not-exists branch).
do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'product_video' and policyname = 'product_video_isolation'
  ) then
    -- Defence-in-depth: ensure RLS is forced even if the block above was a
    -- no-op (table already existed from a partial earlier run).
    alter table product_video enable row level security;
    alter table product_video force row level security;
    create policy product_video_isolation on product_video
      using (tenant_id = app.current_tenant_id() or app.is_platform_admin())
      with check (tenant_id = app.current_tenant_id() or app.is_platform_admin());
  end if;
  -- app_runtime picks up grants via the default-privileges rule in
  -- 02_policies.sql, but on self-hosted Supabase the role is GRANTed at table
  -- level too — belt + braces.
  grant select, insert, update, delete on product_video to app_runtime;
end $$;
