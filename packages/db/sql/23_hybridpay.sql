-- ============================================================================
-- 23_hybridpay.sql — Hybrid Pay payment provider. Additive.
--
-- Hybrid Pay is Hybrid's single white-labeled online payment gateway (powered
-- under the hood by a self-hosted PipraPay instance). It SUBSUMES the individual
-- MFS gateways: customers no longer pick "bKash" / "Nagad" as separate Hybrid
-- options — they pick "Hybrid Pay" and choose the underlying method on Hybrid
-- Pay's hosted page. So we add ONE new provider value rather than per-method ones.
--
-- Per-tenant isolation: each tenant is a "brand" on the shared Hybrid Pay
-- instance with its own API key. Those creds live in the existing
-- payment_account.credentials jsonb (AES-256-GCM sealed) under provider
-- 'hybridpay' — no new table required, no schema change beyond this enum value.
--
-- PG15 allows ALTER TYPE ... ADD VALUE inside a transaction (the migrate runner
-- wraps each file in one); the new value is simply not used within this file.
-- ============================================================================

alter type payment_provider add value if not exists 'hybridpay';
