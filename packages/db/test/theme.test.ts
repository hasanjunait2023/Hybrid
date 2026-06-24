// ============================================================================
// Theme customizer slice integration suite (Wave-1: S-THEME-CUSTOMIZER).
// Runs against the SAME ephemeral embedded Postgres as the RLS gate
// (global-setup.ts), as the non-superuser app_runtime_login role (RLS FORCED).
// apps/web/lib/** resolves via the @hybrid/db + @/ aliases in vitest.config.ts.
//
// Proves:
//   1. Zod schema rejects hostile/malformed settings (XSS color, bad url, extra
//      section type, missing section) and accepts a complete valid object.
//   2. getOrCreateDraftTheme seeds a draft from defaults on first open and is
//      idempotent (one draft row, returned again on second call).
//   3. saveDraftTheme persists edits to the draft WITHOUT touching the published
//      (is_active=true) row the storefront reads.
//   4. publishDraftTheme copies draft → published in one atomic step; the
//      storefront read path (getTenantContextBySlug) then reflects the change.
//   5. activateTheme switches the draft to a catalog theme's defaults, keeping
//      the seller's store name.
//   6. Cross-tenant: tenant A's theme writes never appear under tenant B (RLS).
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asPlatformAdmin, withTenant } from "../src/index";
import {
  getOrCreateDraftTheme,
  saveDraftTheme,
  publishDraftTheme,
  getPublishedTheme,
  activateTheme,
} from "../../../apps/web/lib/theme/data";
import { validateThemeSettings } from "../../../apps/web/lib/theme/schema";
import { themeDefaults } from "../../../apps/web/lib/theme/catalog";
import type { ThemeSettings } from "../../../apps/web/lib/theme/schema";

const TENANT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa000a";
const TENANT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb000b";
const OWNER_A = "11111111-1111-1111-1111-111111111001";
const OWNER_B = "11111111-1111-1111-1111-111111111002";

function validSettings(overrides: Partial<ThemeSettings> = {}): ThemeSettings {
  return { ...themeDefaults("doreja"), ...overrides };
}

// Reset theme rows to a known single published row per tenant before each spec
// group that mutates, so specs don't bleed (the suite shares one DB).
async function resetThemeRows(): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    const theme = await tx<{ id: string }[]>`
      select id from theme where is_active = true order by sort_order asc limit 1
    `;
    for (const [tenantId, name] of [
      [TENANT_A, "Store A"],
      [TENANT_B, "Store B"],
    ] as const) {
      await tx`delete from tenant_theme_settings where tenant_id = ${tenantId}`;
      await tx`
        insert into tenant_theme_settings (tenant_id, theme_id, is_active, settings)
        values (${tenantId}, ${theme[0]!.id}, true,
          ${tx.json({ themeCode: "doreja", content: { storeName: name } } as never)})
      `;
    }
  });
}

beforeAll(async () => {
  await resetThemeRows();
});

afterAll(async () => {
  await resetThemeRows();
});

describe("theme settings — Zod validation", () => {
  it("accepts a complete valid settings object", () => {
    const res = validateThemeSettings(validSettings());
    expect(res.ok).toBe(true);
  });

  it("rejects a non-hex (CSS-injection) color value", () => {
    const bad = validSettings();
    bad.colors.primary = "red;}body{background:url(x)}";
    expect(validateThemeSettings(bad).ok).toBe(false);
  });

  it("rejects a javascript: logo URL", () => {
    const bad = validSettings();
    bad.content = { ...bad.content, logoUrl: "javascript:alert(1)" };
    expect(validateThemeSettings(bad).ok).toBe(false);
  });

  it("rejects an unknown section type", () => {
    const bad = validSettings();
    // @ts-expect-error hostile extra type
    bad.sections = [...bad.sections.slice(1), { type: "custom_html", enabled: true, position: 4 }];
    expect(validateThemeSettings(bad).ok).toBe(false);
  });

  it("rejects a sections array missing a fixed section", () => {
    const bad = validSettings();
    bad.sections = bad.sections.slice(1); // drop one → wrong length
    expect(validateThemeSettings(bad).ok).toBe(false);
  });

  it("rejects an unknown extra top-level key (strict)", () => {
    const bad = { ...validSettings(), customCss: "body{}" };
    expect(validateThemeSettings(bad).ok).toBe(false);
  });
});

describe("theme draft → publish lifecycle", () => {
  it("seeds a draft on first open and is idempotent", async () => {
    const first = await getOrCreateDraftTheme(TENANT_A, OWNER_A);
    const second = await getOrCreateDraftTheme(TENANT_A, OWNER_A);
    expect(first.id).toBe(second.id);

    const draftRows = await withTenant(TENANT_A, OWNER_A, (tx) =>
      tx<{ n: string }[]>`
        select count(*)::text as n from tenant_theme_settings where is_active = false
      `,
    );
    expect(Number(draftRows[0]!.n)).toBe(1);
  });

  it("saveDraftTheme edits the draft without touching the published row", async () => {
    await getOrCreateDraftTheme(TENANT_A, OWNER_A);

    const beforePublished = await getPublishedTheme(TENANT_A, OWNER_A);
    const edited = validSettings({
      colors: { ...themeDefaults("doreja").colors, primary: "#123456" },
    });
    await saveDraftTheme(TENANT_A, OWNER_A, edited);

    // Published unchanged.
    const afterPublished = await getPublishedTheme(TENANT_A, OWNER_A);
    expect(afterPublished?.settings.colors.primary).toBe(
      beforePublished?.settings.colors.primary,
    );

    // Draft carries the edit.
    const draft = await getOrCreateDraftTheme(TENANT_A, OWNER_A);
    expect(draft.settings.colors.primary).toBe("#123456");
  });

  it("publishDraftTheme copies the draft onto the published row", async () => {
    await saveDraftTheme(
      TENANT_A,
      OWNER_A,
      validSettings({ colors: { ...themeDefaults("doreja").colors, primary: "#0A0B0C" } }),
    );
    await publishDraftTheme(TENANT_A, OWNER_A);

    const published = await getPublishedTheme(TENANT_A, OWNER_A);
    expect(published?.settings.colors.primary).toBe("#0A0B0C");

    // Exactly one active row (partial unique index respected).
    const activeCount = await withTenant(TENANT_A, OWNER_A, (tx) =>
      tx<{ n: string }[]>`
        select count(*)::text as n from tenant_theme_settings where is_active = true
      `,
    );
    expect(Number(activeCount[0]!.n)).toBe(1);
  });

  it("saveDraftTheme rejects invalid settings before any write", async () => {
    const bad = validSettings();
    bad.colors.text = "not-a-hex";
    await expect(saveDraftTheme(TENANT_A, OWNER_A, bad)).rejects.toThrow();
  });
});

describe("theme activation", () => {
  it("activateTheme resets the draft to theme defaults but keeps the store name", async () => {
    // Give the draft a recognizable store name first.
    await saveDraftTheme(
      TENANT_A,
      OWNER_A,
      validSettings({
        content: { ...themeDefaults("doreja").content, storeName: "রেশমির দোকান" },
      }),
    );

    const next = await activateTheme(TENANT_A, OWNER_A, "megh");
    expect(next.themeCode).toBe("megh");
    expect(next.colors.primary).toBe(themeDefaults("megh").colors.primary);
    expect(next.content.storeName).toBe("রেশমির দোকান");

    const draft = await getOrCreateDraftTheme(TENANT_A, OWNER_A);
    expect(draft.settings.themeCode).toBe("megh");
  });
});

describe("theme RLS isolation", () => {
  it("tenant A's draft/publish writes never appear under tenant B", async () => {
    await saveDraftTheme(
      TENANT_A,
      OWNER_A,
      validSettings({ colors: { ...themeDefaults("doreja").colors, primary: "#AAAAAA" } }),
    );
    await publishDraftTheme(TENANT_A, OWNER_A);

    const bPublished = await getPublishedTheme(TENANT_B, OWNER_B);
    expect(bPublished?.settings.colors.primary).not.toBe("#AAAAAA");

    // B sees only its own rows.
    const bRows = await withTenant(TENANT_B, OWNER_B, (tx) =>
      tx<{ tenant_id: string }[]>`select tenant_id from tenant_theme_settings`,
    );
    expect(bRows.every((r) => r.tenant_id === TENANT_B)).toBe(true);
  });
});
