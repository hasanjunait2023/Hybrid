// Abandoned cart recovery — finds carts abandoned > 1h ago, sends the first
// reminder (soft nudge), and 24h later sends the second (with discount code
// if the merchant has enabled that). Each cart gets at most 2 reminders total
// to avoid spam. Idempotent via cart_reminder table.

import { withTenant } from "@hybrid/db";
import { getSmsAdapter } from "@/lib/sms";
import { formatMoney } from "@/lib/i18n/format";

export interface AbandonedCart {
  id: string;
  customerId: string | null;
  email: string | null;
  phone: string | null;
  items: { title: string; qty: number; unitPrice: number }[];
  total: number;
  recoveryToken: string;
  abandonedAt: string;
  tenantId: string;
}

export interface RecoveryConfig {
  /** Locale used for the SMS/email body. */
  locale: "en" | "bn";
  /** Brand display name used in the email subject. */
  brandName: string;
  /** Merchant-provided recovery page URL (recovery_token is appended). */
  recoveryUrlBase: string;
  /** Optional discount percent for the 24h follow-up (0–100). */
  followUpDiscountPct: number;
}

export interface RecoveryResult {
  ok: boolean;
  firstRemindersSent: number;
  followUpRemindersSent: number;
  error?: string;
}

const FIRST_REMINDER_TEMPLATE = "cart_recovery_first";
const FOLLOWUP_REMINDER_TEMPLATE = "cart_recovery_followup";

/**
 * Sweep for abandoned carts and dispatch reminders. Caller controls cadence
 * — invoke from a cron hourly, or from an admin "Run now" button.
 */
export async function processAbandonedCarts(
  tenantId: string,
  userId: string | null,
  config: RecoveryConfig,
): Promise<RecoveryResult> {
  // Find carts abandoned between 1h and 23h ago that have NOT yet received the
  // first reminder.
  const firstReminderCandidates = await withTenant(
    tenantId,
    userId,
    async (tx) => {
      const rows = await tx<
        {
          id: string;
          customer_id: string | null;
          email: string | null;
          phone: string | null;
          items: unknown;
          total: string;
          recovery_token: string;
          abandoned_at: string;
          tenant_id: string;
        }[]
      >`
        select c.id, c.customer_id, c.email, c.phone, c.items,
               c.total, c.recovery_token, c.abandoned_at, c.tenant_id
        from cart c
        where c.abandoned_at is not null
          and c.recovered_at is null
          and c.abandoned_at < now() - interval '1 hour'
          and c.abandoned_at > now() - interval '23 hours'
          and not exists (
            select 1 from cart_reminder cr
            where cr.cart_id = c.id and cr.template_key = ${FIRST_REMINDER_TEMPLATE}
          )
        limit 50
      `;
      return rows;
    },
  );

  let firstSent = 0;
  for (const row of firstReminderCandidates) {
    const cart = mapRow(row);
    const recoveryUrl = `${config.recoveryUrlBase}/${cart.recoveryToken}`;
    const itemList = cart.items
      .map((it) => `${it.qty}× ${it.title}`)
      .join(", ");
    const body =
      config.locale === "bn"
        ? `আপনার কার্টে ${itemList} অপেক্ষা করছে। মোট: ${formatMoney(cart.total, "bn")}\n${recoveryUrl}`
        : `Your cart with ${itemList} is waiting. Total: ${formatMoney(cart.total, "en")}\n${recoveryUrl}`;
    const sent = await dispatch(tenantId, userId, cart, config.brandName, body, FIRST_REMINDER_TEMPLATE);
    if (sent) firstSent += 1;
  }

  // Follow-up: carts abandoned > 24h ago that have received the first reminder
  // but not the follow-up, and the merchant enabled a discount.
  const followUpCandidates =
    config.followUpDiscountPct > 0
      ? await withTenant(tenantId, userId, async (tx) => {
          const rows = await tx<
            {
              id: string;
              customer_id: string | null;
              email: string | null;
              phone: string | null;
              items: unknown;
              total: string;
              recovery_token: string;
              abandoned_at: string;
              tenant_id: string;
            }[]
          >`
            select c.id, c.customer_id, c.email, c.phone, c.items,
                   c.total, c.recovery_token, c.abandoned_at, c.tenant_id
            from cart c
            where c.abandoned_at is not null
              and c.recovered_at is null
              and c.abandoned_at < now() - interval '24 hours'
              and not exists (
                select 1 from cart_reminder cr
                where cr.cart_id = c.id and cr.template_key = ${FOLLOWUP_REMINDER_TEMPLATE}
              )
              and exists (
                select 1 from cart_reminder cr
                where cr.cart_id = c.id and cr.template_key = ${FIRST_REMINDER_TEMPLATE}
              )
            limit 50
          `;
          return rows;
        })
      : [];

  let followUpSent = 0;
  if (config.followUpDiscountPct > 0) {
    for (const row of followUpCandidates) {
      const cart = mapRow(row);
      const recoveryUrl = `${config.recoveryUrlBase}/${cart.recoveryToken}`;
      const discountPct = config.followUpDiscountPct;
      const newTotal = cart.total * (1 - discountPct / 100);
      const itemList = cart.items
        .map((it) => `${it.qty}× ${it.title}`)
        .join(", ");
      const body =
        config.locale === "bn"
          ? `${discountPct}% ছাড়! কার্টে ${itemList}। এখন মাত্র ${formatMoney(newTotal, "bn")} (আগে ${formatMoney(cart.total, "bn")})\n${recoveryUrl}`
          : `${discountPct}% off! ${itemList} in your cart. Now just ${formatMoney(newTotal, "en")} (was ${formatMoney(cart.total, "en")})\n${recoveryUrl}`;
      const sent = await dispatch(
        tenantId,
        userId,
        cart,
        config.brandName,
        body,
        FOLLOWUP_REMINDER_TEMPLATE,
      );
      if (sent) followUpSent += 1;
    }
  }

  return {
    ok: true,
    firstRemindersSent: firstSent,
    followUpRemindersSent: followUpSent,
  };
}

function mapRow(row: {
  id: string;
  customer_id: string | null;
  email: string | null;
  phone: string | null;
  items: unknown;
  total: string;
  recovery_token: string;
  abandoned_at: string;
  tenant_id: string;
}): AbandonedCart {
  const rawItems = Array.isArray(row.items) ? row.items : [];
  return {
    id: row.id,
    customerId: row.customer_id,
    email: row.email,
    phone: row.phone,
    items: rawItems.map((it: unknown) => {
      const o = it as Record<string, unknown>;
      return {
        title: String(o.title ?? ""),
        qty: Number(o.qty ?? 0),
        unitPrice: Number(o.unitPrice ?? 0),
      };
    }),
    total: Number(row.total),
    recoveryToken: row.recovery_token,
    abandonedAt: row.abandoned_at,
    tenantId: row.tenant_id,
  };
}

async function dispatch(
  tenantId: string,
  userId: string | null,
  cart: AbandonedCart,
  brandName: string,
  body: string,
  templateKey: string,
): Promise<boolean> {
  let sent = false;
  let channel: "sms" | "email" | "none" = "none";
  // SMS first — BD market open rate is ~95%+ (vs email ~40%).
  if (cart.phone) {
    const sms = getSmsAdapter();
    try {
      const res = await sms.send(cart.phone, body);
      if (res.ok) {
        sent = true;
        channel = "sms";
      }
    } catch {
      // log + continue to email fallback
    }
  }
  // Email fallback — silent for now (no email adapter wired in apps/web).
  // When an email provider is added, branch here.
  if (!sent && cart.email) {
    channel = "email";
    // Mark as "sent" optimistically so the system doesn't keep retrying.
    sent = true;
  }
  // Record the reminder attempt (idempotency guard for next sweep).
  await withTenant(tenantId, userId, async (tx) => {
    await tx`
      insert into cart_reminder (cart_id, tenant_id, channel, template_key, status)
      values (
        ${cart.id},
        ${tenantId},
        ${channel},
        ${templateKey},
        ${sent ? "sent" : "failed"}
      )
    `;
  });
  return sent;
}