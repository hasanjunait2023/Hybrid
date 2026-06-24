// ============================================================================
// WhatsApp notifications suite (Wave-3: S-WHATSAPP). Runs against the SAME
// ephemeral embedded Postgres as the RLS gate (global-setup.ts), as the
// non-superuser app_runtime_login role (RLS FORCED). Imports the WhatsApp
// adapter + notify wiring + settings helper straight from apps/web/lib/**;
// "@hybrid/db" / "@hybrid/ui" are aliased to package sources in vitest.config.ts.
//
// Proves:
//   1. Pure adapter — sendOrderConfirmation POSTs the approved template to
//      graph.facebook.com/v17.0/{phoneNumberId}/messages with the bearer token,
//      4 positional body params, returns the wamid; missing creds throw.
//   2. Adapter error path — a non-ok HTTP response throws with the API message.
//   3. Settings round-trip — creds sealed (sealCredentials) into
//      tenant.settings.notifications.whatsapp; getWhatsAppSettings exposes only
//      enabled/configured + a MASKED tail, never the raw access token.
//   4. Notify opt-in — notifyOrderPlacedWhatsApp is a NO-OP (no fetch) when the
//      tenant has not enabled WhatsApp or has no sealed creds.
//   5. Notify flag gate — with creds + enabled but WHATSAPP_ENABLED!=1, the live
//      Meta call is NOT made (log-only); with WHATSAPP_ENABLED=1 it fires once
//      against the seeded tenant's sealed creds.
//   6. Notify is non-blocking — a thrown fetch never rejects the promise.
//
// Live Meta API + template approval are founder-deferred; the adapter request
// CONTRACT is covered here with a fake fetch (no network). No stubs in the
// wiring itself (real seal/open, real RLS read).
// ============================================================================
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { asPlatformAdmin, withTenant, sealCredentials } from "../src/index";
import { WhatsAppAdapter } from "../../../apps/web/lib/whatsapp/adapter";
import type { FetchLike } from "../../../apps/web/lib/whatsapp/adapter";
import { notifyOrderPlacedWhatsApp } from "../../../apps/web/lib/whatsapp/notify";
import { getWhatsAppSettings } from "../../../apps/web/lib/admin/settings";

const TENANT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa000a";
const OWNER_A = "11111111-1111-1111-1111-111111111001";

const CREDS = {
  wabaId: "104300000000001",
  phoneNumberId: "109900000000002",
  accessToken: "EAAG-system-user-token-abc123xyz",
};

// A captured-request fake fetch returning the Cloud API success envelope.
function makeFakeFetch(): { fetch: FetchLike; calls: { url: string; init?: unknown }[] } {
  const calls: { url: string; init?: unknown }[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: true,
      status: 200,
      json: async () => ({ messages: [{ id: "wamid.TEST123" }] }),
      text: async () => "",
    };
  };
  return { fetch, calls };
}

beforeAll(async () => {
  // Credential crypto needs a 32-byte key; provide a deterministic test key if
  // the env didn't supply one (mirrors courier-wire.test.ts).
  if (!process.env.APP_ENCRYPTION_KEY) {
    process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  }
  // Seed tenant A with WhatsApp DISABLED + no creds initially.
  await asPlatformAdmin(async (tx) => {
    await tx`delete from tenant where id = ${TENANT_A}`;
    await tx`
      insert into tenant (id, name, slug, status, owner_user_id, default_locale, currency, timezone, settings)
      values (${TENANT_A}, 'WA Store', 'wa-store', 'active', ${OWNER_A}, 'bn', 'BDT', 'Asia/Dhaka', '{}'::jsonb)
    `;
  });
});

afterEach(() => {
  delete process.env.WHATSAPP_ENABLED;
});

describe("WhatsAppAdapter (pure)", () => {
  it("POSTs the approved template with bearer auth + 4 positional params", async () => {
    const { fetch, calls } = makeFakeFetch();
    const adapter = new WhatsAppAdapter({ fetch });

    const result = await adapter.sendOrderConfirmation(
      "8801712345678",
      { customerName: "Rahim", orderNumber: "১২৩", totalBdt: "৳৯৯৯", storeName: "WA Store" },
      CREDS,
    );

    expect(result.ok).toBe(true);
    expect(result.messageId).toBe("wamid.TEST123");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(
      "https://graph.facebook.com/v17.0/109900000000002/messages",
    );
    const init = calls[0]!.init as { method: string; headers: Record<string, string>; body: string };
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe(`Bearer ${CREDS.accessToken}`);
    const body = JSON.parse(init.body);
    expect(body.messaging_product).toBe("whatsapp");
    expect(body.to).toBe("8801712345678");
    expect(body.template.name).toBe("order_confirmation");
    expect(body.template.language.code).toBe("bn");
    expect(body.template.components[0].parameters.map((p: { text: string }) => p.text)).toEqual([
      "Rahim",
      "১২৩",
      "৳৯৯৯",
      "WA Store",
    ]);
  });

  it("throws when credentials are incomplete", async () => {
    const { fetch } = makeFakeFetch();
    const adapter = new WhatsAppAdapter({ fetch });
    await expect(
      adapter.sendOrderConfirmation(
        "8801712345678",
        { customerName: "X", orderNumber: "1", totalBdt: "1", storeName: "S" },
        { wabaId: "w", phoneNumberId: "", accessToken: "" },
      ),
    ).rejects.toThrow(/incomplete/i);
  });

  it("throws with the API error message on a non-ok response", async () => {
    const adapter = new WhatsAppAdapter({
      fetch: async () => ({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: "Invalid OAuth access token", code: 190 } }),
        text: async () => "",
      }),
    });
    await expect(
      adapter.sendOrderConfirmation(
        "8801712345678",
        { customerName: "X", orderNumber: "1", totalBdt: "1", storeName: "S" },
        CREDS,
      ),
    ).rejects.toThrow(/401.*Invalid OAuth access token/);
  });
});

describe("getWhatsAppSettings (masked read)", () => {
  it("round-trips sealed creds and exposes only masked hints", async () => {
    const sealed = sealCredentials(CREDS);
    await withTenant(TENANT_A, OWNER_A, async (tx) => {
      const nextSettings = {
        notifications: {
          whatsapp: { enabled: true, credentials: sealed },
        },
      };
      await tx`
        update tenant set settings = ${tx.json(nextSettings as never)}
        where id = ${TENANT_A}
      `;
    });

    const settings = await getWhatsAppSettings(TENANT_A, OWNER_A);
    expect(settings.enabled).toBe(true);
    expect(settings.configured).toBe(true);
    // Masked tail only — never the raw token.
    expect(settings.wabaIdHint).toBe(`••••${CREDS.wabaId.slice(-4)}`);
    expect(settings.phoneNumberIdHint).toBe(`••••${CREDS.phoneNumberId.slice(-4)}`);
    expect(JSON.stringify(settings)).not.toContain(CREDS.accessToken);
  });
});

describe("notifyOrderPlacedWhatsApp (post-commit wiring)", () => {
  const baseInput = {
    tenantId: TENANT_A,
    storeName: "WA Store",
    orderNumber: 42,
    total: 999,
    customerName: "Rahim",
    customerPhone: "8801712345678",
  };

  it("is a no-op (no live call) when WHATSAPP_ENABLED is unset, even with creds", async () => {
    // Tenant A already has enabled + creds from the prior test.
    let fetched = false;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      fetched = true;
      throw new Error("should not be called");
    }) as typeof fetch;
    try {
      await expect(notifyOrderPlacedWhatsApp(baseInput)).resolves.toBeUndefined();
      expect(fetched).toBe(false); // log-only gate honored
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("fires exactly one live Meta call when WHATSAPP_ENABLED=1", async () => {
    process.env.WHATSAPP_ENABLED = "1";
    const calls: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      calls.push(String(url));
      return {
        ok: true,
        status: 200,
        json: async () => ({ messages: [{ id: "wamid.LIVE" }] }),
        text: async () => "",
      } as unknown as Response;
    }) as typeof fetch;
    try {
      await notifyOrderPlacedWhatsApp(baseInput);
      expect(calls).toHaveLength(1);
      expect(calls[0]).toBe("https://graph.facebook.com/v17.0/109900000000002/messages");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("never rejects when the live call throws (non-blocking)", async () => {
    process.env.WHATSAPP_ENABLED = "1";
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error("network down");
    }) as typeof fetch;
    try {
      await expect(notifyOrderPlacedWhatsApp(baseInput)).resolves.toBeUndefined();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("is a no-op for a tenant that has not opted in", async () => {
    // Reset tenant A to disabled, no creds; confirm no fetch fires even live.
    await withTenant(TENANT_A, OWNER_A, async (tx) => {
      await tx`update tenant set settings = '{}'::jsonb where id = ${TENANT_A}`;
    });
    process.env.WHATSAPP_ENABLED = "1";
    let fetched = false;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      fetched = true;
      throw new Error("should not be called");
    }) as typeof fetch;
    try {
      await notifyOrderPlacedWhatsApp(baseInput);
      expect(fetched).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
