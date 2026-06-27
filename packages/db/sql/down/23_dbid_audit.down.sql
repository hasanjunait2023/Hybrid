-- Migration 23 rollback — DBID reviewer audit actions.
-- PostgreSQL does not support removing enum values. New enum values
-- remain in the type but cause no harm if no application code writes
-- them. This rollback is intentionally a no-op.

-- (no statements — see comment above)