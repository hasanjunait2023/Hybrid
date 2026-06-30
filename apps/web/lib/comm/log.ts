// Communication log writer. Logs every SMS / email send attempt to the
// `sms_log` / `email_log` tables so the customer-detail timeline can show
// what was sent to a buyer (closes the H1 half-built feature).
//
// Design:
//  - `logSms` / `logEmail` are the only writers — call them from the SMS
//    adapter or the post-commit notify path.
//  - Both run inside `asPlatformAdmin` because they may be called from a
//    queue worker (no tenant context) right after the order txn commits.
//    RLS still isolates the rows by tenant_id.
//  - `readCommunications` is the read used by the customer-detail page; it
//    queries both tables via `withTenant` so RLS applies normally.

import { withTenant, asPlatformAdmin } from "@hybrid/db";

export interface SmsLogInput {
  tenantId: string;
  customerId: string | null;
  phone: string;
  templateKey: string;
  body: string;
  status: "queued" | "sent" | "failed";
  error?: string;
}

export interface EmailLogInput {
  tenantId: string;
  customerId: string | null;
  toEmail: string;
  templateKey: string;
  subject: string;
  body: string;
  status: "queued" | "sent" | "failed";
  error?: string;
}

export interface CommunicationEntry {
  channel: "sms" | "email";
  templateKey: string;
  sentAt: string;
  status: string;
  // SMS shows body directly; emails collapse to subject to keep the timeline dense.
  preview: string;
}

/**
 * Write one SMS row. Caller is responsible for calling AFTER the gateway
 * response — pass `status: 'sent'` if the gateway returned ok, otherwise
 * capture `error` and pass `status: 'failed'`.
 */
export async function logSms(input: SmsLogInput): Promise<void> {
  await asPlatformAdmin((tx) =>
    tx`
      insert into sms_log (
        tenant_id, customer_id, phone, template_key, body, status, error, sent_at
      ) values (
        ${input.tenantId}::uuid,
        ${input.customerId}::uuid,
        ${input.phone},
        ${input.templateKey},
        ${input.body},
        ${input.status},
        ${input.error ?? null},
        now()
      )
    `,
  );
}

/** Write one email row. Same contract as `logSms`. */
export async function logEmail(input: EmailLogInput): Promise<void> {
  await asPlatformAdmin((tx) =>
    tx`
      insert into email_log (
        tenant_id, customer_id, to_email, template_key, subject, body, status, error, sent_at
      ) values (
        ${input.tenantId}::uuid,
        ${input.customerId}::uuid,
        ${input.toEmail},
        ${input.templateKey},
        ${input.subject},
        ${input.body},
        ${input.status},
        ${input.error ?? null},
        now()
      )
    `,
  );
}

/**
 * Read all communications for a customer. Sorted newest-first, capped at
 * `limit` to keep the customer-detail page light.
 */
export async function readCommunications(
  tenantId: string,
  userId: string,
  customerId: string,
  limit = 50,
): Promise<CommunicationEntry[]> {
  return withTenant(tenantId, userId, async (tx) => {
    const smsRows = await tx<
      Array<{
        template_key: string;
        sent_at: Date;
        status: string;
        body: string;
      }>
    >`
      select template_key, sent_at, status, body
      from sms_log
      where customer_id = ${customerId}::uuid
      order by sent_at desc
      limit ${limit}
    `;
    const emailRows = await tx<
      Array<{
        template_key: string;
        sent_at: Date;
        status: string;
        subject: string;
      }>
    >`
      select template_key, sent_at, status, subject
      from email_log
      where customer_id = ${customerId}::uuid
      order by sent_at desc
      limit ${limit}
    `;

    const merged: CommunicationEntry[] = [
      ...smsRows.map((r) => ({
        channel: "sms" as const,
        templateKey: r.template_key,
        sentAt: r.sent_at.toISOString(),
        status: r.status,
        preview: r.body,
      })),
      ...emailRows.map((r) => ({
        channel: "email" as const,
        templateKey: r.template_key,
        sentAt: r.sent_at.toISOString(),
        status: r.status,
        preview: r.subject,
      })),
    ];
    merged.sort((a, b) => (a.sentAt < b.sentAt ? 1 : a.sentAt > b.sentAt ? -1 : 0));
    return merged.slice(0, limit);
  });
}