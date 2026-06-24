// Theme settings persistence (brief §2.2/2.3; DESIGN §Q1/§Q2). All tenant
// reads/writes go through withTenant() (RLS forced) — tenant_theme_settings is a
// tenant-isolated table. The `theme` catalog row is world-readable but we only
// need its id (the single shipped row) to satisfy the not-null FK; the real
// theme identity lives in settings.themeCode.
//
// Two-row draft/publish model:
//   published row  is_active = true    (read by the storefront; one per tenant,
//                                        enforced by tenant_theme_one_active)
//   draft row      is_active = false   (edited live by the customizer)
//
// Publish copies draft.settings -> published.settings in one transaction, then
// the Server Action revalidates tenant:{id}:theme. We never flip is_active on
// the draft (that would race the partial unique index); copying settings is the
// atomic, index-safe swap.
import { withTenant } from "@hybrid/db";
import type { Tx } from "@hybrid/db";
import {
  ThemeSettingsSchema,
  validateThemeSettings,
  type ThemeSettings,
} from "./schema";
import { themeDefaults, DEFAULT_THEME_CODE } from "./catalog";

type Jsonb = Parameters<Tx["json"]>[0];

export interface ThemeRow {
  id: string;
  settings: ThemeSettings;
}

// Coerce a raw JSON column to fully-formed ThemeSettings. A legacy/partial row
// (Phase-0 seed stored only {colors,storeName}) or any missing key is healed by
// merging onto the theme's catalog defaults, then re-validating. Returns the
// Doreja default if the row is unusable — the customizer never opens on a blank
// or broken slate (DESIGN §Q1.4 empty/first-run).
export function coerceSettings(raw: unknown): ThemeSettings {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const code =
    typeof obj.themeCode === "string" ? obj.themeCode : DEFAULT_THEME_CODE;
  const base = themeDefaults(code);

  const rawColors = (obj.colors ?? {}) as Record<string, unknown>;
  const merged: ThemeSettings = {
    themeCode: code,
    colors: { ...base.colors, ...pickStrings(rawColors) },
    typography: { ...base.typography, ...(obj.typography as object | undefined) },
    content: { ...base.content, ...(obj.content as object | undefined) },
    sections:
      Array.isArray(obj.sections) && obj.sections.length === base.sections.length
        ? (obj.sections as ThemeSettings["sections"])
        : base.sections,
  };

  const parsed = ThemeSettingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : base;
}

function pickStrings(o: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** The published (is_active=true) settings, or null if the tenant has none. */
export async function getPublishedTheme(
  tenantId: string,
  userId: string,
): Promise<ThemeRow | null> {
  return withTenant(tenantId, userId, async (tx) => {
    const rows = await tx<{ id: string; settings: unknown }[]>`
      select id, settings
        from tenant_theme_settings
       where is_active = true
       order by updated_at desc
       limit 1
    `;
    const row = rows[0];
    if (!row) return null;
    return { id: row.id, settings: coerceSettings(row.settings) };
  });
}

// The draft (is_active=false) the customizer edits. Creates one on first open by
// cloning the published settings (or the active theme defaults) so the seller is
// never on a blank slate (DESIGN §Q1.4). Idempotent: returns the existing draft
// if one is present.
export async function getOrCreateDraftTheme(
  tenantId: string,
  userId: string,
): Promise<ThemeRow> {
  return withTenant(tenantId, userId, async (tx) => {
    const existing = await tx<{ id: string; settings: unknown }[]>`
      select id, settings
        from tenant_theme_settings
       where is_active = false
       order by updated_at desc
       limit 1
    `;
    if (existing[0]) {
      return { id: existing[0].id, settings: coerceSettings(existing[0].settings) };
    }

    const themeId = await resolveCatalogThemeId(tx);
    const seed = await seedSettings(tx);
    const inserted = await tx<{ id: string }[]>`
      insert into tenant_theme_settings (tenant_id, theme_id, is_active, settings)
      values (${tenantId}, ${themeId}, false, ${tx.json(seed as Jsonb)})
      returning id
    `;
    return { id: inserted[0]!.id, settings: seed };
  });
}

/** Settings to seed a fresh draft from: published if present, else defaults. */
async function seedSettings(tx: Tx): Promise<ThemeSettings> {
  const published = await tx<{ settings: unknown }[]>`
    select settings from tenant_theme_settings
     where is_active = true order by updated_at desc limit 1
  `;
  if (published[0]) return coerceSettings(published[0].settings);
  return themeDefaults(DEFAULT_THEME_CODE);
}

// The single shipped `theme` row id (world-readable). Used only to satisfy the
// not-null FK; the theme identity the storefront renders from is settings.themeCode.
async function resolveCatalogThemeId(tx: Tx): Promise<string> {
  const rows = await tx<{ id: string }[]>`
    select id from theme where is_active = true order by sort_order asc limit 1
  `;
  if (!rows[0]) {
    throw new Error("কোনো থিম পাওয়া যায়নি।");
  }
  return rows[0].id;
}

// ---------------------------------------------------------------------------
// Writes (all validated upstream by the Server Action; we re-validate here too).
// ---------------------------------------------------------------------------

/** Overwrite the draft row's settings (autosave path). Validates before write. */
export async function saveDraftTheme(
  tenantId: string,
  userId: string,
  settings: ThemeSettings,
): Promise<void> {
  const check = validateThemeSettings(settings);
  if (!check.ok || !check.data) {
    throw new Error(check.error ?? "থিম সেটিংস সঠিক নয়।");
  }
  const valid = check.data;
  await withTenant(tenantId, userId, async (tx) => {
    // Ensure a draft exists, then write. We resolve the id inside the same txn.
    const existing = await tx<{ id: string }[]>`
      select id from tenant_theme_settings where is_active = false
       order by updated_at desc limit 1
    `;
    if (existing[0]) {
      await tx`
        update tenant_theme_settings
           set settings = ${tx.json(valid as Jsonb)}, updated_at = now()
         where id = ${existing[0].id}
      `;
      return;
    }
    const themeId = await resolveCatalogThemeId(tx);
    await tx`
      insert into tenant_theme_settings (tenant_id, theme_id, is_active, settings)
      values (${tenantId}, ${themeId}, false, ${tx.json(valid as Jsonb)})
    `;
  });
}

// Publish: copy the draft settings onto the published (is_active=true) row in one
// transaction. Creates the published row if the tenant has none yet. The caller
// (Server Action) revalidates tenant:{id}:theme afterward.
export async function publishDraftTheme(
  tenantId: string,
  userId: string,
): Promise<void> {
  await withTenant(tenantId, userId, async (tx) => {
    const draft = await tx<{ settings: unknown }[]>`
      select settings from tenant_theme_settings where is_active = false
       order by updated_at desc limit 1
    `;
    if (!draft[0]) {
      throw new Error("প্রকাশযোগ্য খসড়া পাওয়া যায়নি।");
    }
    const settings = coerceSettings(draft[0].settings);

    const published = await tx<{ id: string }[]>`
      select id from tenant_theme_settings where is_active = true
       order by updated_at desc limit 1
    `;
    if (published[0]) {
      await tx`
        update tenant_theme_settings
           set settings = ${tx.json(settings as Jsonb)}, updated_at = now()
         where id = ${published[0].id}
      `;
      return;
    }
    const themeId = await resolveCatalogThemeId(tx);
    await tx`
      insert into tenant_theme_settings (tenant_id, theme_id, is_active, settings)
      values (${tenantId}, ${themeId}, true, ${tx.json(settings as Jsonb)})
    `;
  });
}

// Activate a catalog theme: reset the DRAFT to the theme's defaults (preserving
// the seller's store name so they don't lose it), so the seller lands in the
// customizer on the new theme (DESIGN §Q2 activate flow). Publishing is a
// separate, explicit step — activation alone never changes the live store.
export async function activateTheme(
  tenantId: string,
  userId: string,
  themeCode: string,
): Promise<ThemeSettings> {
  const defaults = themeDefaults(themeCode);
  return withTenant(tenantId, userId, async (tx) => {
    // Carry forward the current store name + logo if we have any settings.
    const current = await tx<{ settings: unknown }[]>`
      select settings from tenant_theme_settings
       order by updated_at desc limit 1
    `;
    const prior = current[0] ? coerceSettings(current[0].settings) : null;
    const next: ThemeSettings = {
      ...defaults,
      content: {
        ...defaults.content,
        storeName: prior?.content.storeName ?? defaults.content.storeName,
        logoUrl: prior?.content.logoUrl ?? defaults.content.logoUrl,
      },
    };

    const draft = await tx<{ id: string }[]>`
      select id from tenant_theme_settings where is_active = false
       order by updated_at desc limit 1
    `;
    if (draft[0]) {
      await tx`
        update tenant_theme_settings
           set settings = ${tx.json(next as Jsonb)}, updated_at = now()
         where id = ${draft[0].id}
      `;
    } else {
      const themeId = await resolveCatalogThemeId(tx);
      await tx`
        insert into tenant_theme_settings (tenant_id, theme_id, is_active, settings)
        values (${tenantId}, ${themeId}, false, ${tx.json(next as Jsonb)})
      `;
    }
    return next;
  });
}

/** The currently-active theme code for catalog highlighting (published row). */
export async function getActiveThemeCode(
  tenantId: string,
  userId: string,
): Promise<string> {
  const published = await getPublishedTheme(tenantId, userId);
  return published?.settings.themeCode ?? DEFAULT_THEME_CODE;
}

/** The tenant's slug (for building the storefront preview URL in admin). */
export async function getTenantSlug(
  tenantId: string,
  userId: string,
): Promise<string | null> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<{ slug: string }[]>`select slug from tenant where id = ${tenantId} limit 1`,
  );
  return rows[0]?.slug ?? null;
}

/** Collections for the customizer's "featured collection" select. */
export interface CollectionOption {
  id: string;
  title: string;
}
export async function listCollectionOptions(
  tenantId: string,
  userId: string,
): Promise<CollectionOption[]> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<{ id: string; title: string }[]>`
      select id, title from collection where is_active = true
       order by sort_order asc, created_at desc limit 50
    `,
  );
  return rows.map((r) => ({ id: r.id, title: r.title }));
}
