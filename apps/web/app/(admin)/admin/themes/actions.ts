"use server";

// Theme customizer + catalog Server Actions (brief §2.2/2.3; DESIGN §Q1/§Q2).
//
// Three mutations, all authed + tenant-scoped + Zod-validated:
//   saveDraftAction     — autosave the customizer draft (debounced from the UI)
//   publishThemeAction  — copy draft → published, then revalidate tenant:{id}:theme
//   activateThemeAction  — switch the draft to a catalog theme's defaults
//
// Every write goes through the lib/theme/data helpers (withTenant → RLS). The
// settings object is validated by ThemeSettingsSchema BEFORE the DB sees it, so a
// hostile payload (javascript: logo, injected CSS color, extra section type)
// fails closed with a Bengali message and never reaches the JSON column.
import { revalidateTag } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import {
  saveDraftTheme,
  publishDraftTheme,
  activateTheme,
} from "@/lib/theme/data";
import { validateThemeSettings } from "@/lib/theme/schema";
import { getThemeEntry } from "@/lib/theme/catalog";
import { validateBlocks, saveHomePageBlocks } from "@/lib/theme/pageBuilder";

export interface ThemeActionResult {
  ok: boolean;
  error?: string;
}

async function authTenant(): Promise<
  { ok: true; tenantId: string; userId: string } | { ok: false; error: string }
> {
  const session = await getSession();
  if (!session) return { ok: false, error: "লগইন প্রয়োজন।" };
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) return { ok: false, error: "কোনো স্টোর পাওয়া যায়নি।" };
  return { ok: true, tenantId, userId: session.userId };
}

// Autosave the draft. `settingsJson` is the serialized ThemeSettings from the
// client island; we parse + Zod-validate before persisting.
export async function saveDraftAction(
  settingsJson: string,
): Promise<ThemeActionResult> {
  const auth = await authTenant();
  if (!auth.ok) return auth;

  let parsed: unknown;
  try {
    parsed = JSON.parse(settingsJson);
  } catch {
    return { ok: false, error: "সেটিংস পড়া যায়নি।" };
  }

  const check = validateThemeSettings(parsed);
  if (!check.ok || !check.data) {
    return { ok: false, error: check.error ?? "থিম সেটিংস সঠিক নয়।" };
  }

  try {
    await saveDraftTheme(auth.tenantId, auth.userId, check.data);
    return { ok: true };
  } catch {
    return { ok: false, error: "সেভ করা যায়নি, আবার চেষ্টা করুন।" };
  }
}

// Publish: draft → live. One atomic copy, then bust the theme cache tag so the
// storefront (lib/storefront/data.ts) picks up the new palette/sections on the
// next request.
export async function publishThemeAction(): Promise<ThemeActionResult> {
  const auth = await authTenant();
  if (!auth.ok) return auth;

  try {
    await publishDraftTheme(auth.tenantId, auth.userId);
    revalidateTag(`tenant:${auth.tenantId}:theme`);
    return { ok: true };
  } catch {
    return { ok: false, error: "প্রকাশ করা যায়নি, আবার চেষ্টা করুন।" };
  }
}

// Save the page builder home page blocks.
// `blocksJson` is the serialized HomePageBlocks array from the client.
export async function saveHomePageAction(
  blocksJson: string,
): Promise<ThemeActionResult> {
  const auth = await authTenant();
  if (!auth.ok) return auth;

  let parsed: unknown;
  try {
    parsed = JSON.parse(blocksJson);
  } catch {
    return { ok: false, error: "ব্লক ডেটা পড়া যায়নি।" };
  }

  const check = validateBlocks(parsed);
  if (!check.ok) {
    return { ok: false, error: check.error ?? "পেজ ব্লক সঠিক নয়।" };
  }

  try {
    await saveHomePageBlocks(auth.tenantId, auth.userId, check.data);
    revalidateTag(`tenant:${auth.tenantId}:theme`);
    return { ok: true };
  } catch {
    return { ok: false, error: "পেজ সেভ করা যায়নি, আবার চেষ্টা করুন।" };
  }
}

// Activate a catalog theme — resets the DRAFT to the theme defaults (keeps the
// store name/logo). Does NOT touch the live store; the seller publishes next.
export async function activateThemeAction(
  themeCode: string,
): Promise<ThemeActionResult> {
  const auth = await authTenant();
  if (!auth.ok) return auth;

  if (!getThemeEntry(themeCode)) {
    return { ok: false, error: "অজানা থিম।" };
  }

  try {
    await activateTheme(auth.tenantId, auth.userId, themeCode);
    return { ok: true };
  } catch {
    return { ok: false, error: "থিম চালু করা যায়নি, আবার চেষ্টা করুন।" };
  }
}
