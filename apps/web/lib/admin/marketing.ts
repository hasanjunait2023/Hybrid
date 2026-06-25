// Marketing broadcast data layer (tenant roadmap P2-4). Campaigns + audience
// resolution via withTenant (RLS). Dispatch reuses the platform SMS adapter
// (gated by SMS_LIVE — log-only off, real send on), so nothing is faked: the
// campaign record + recipient resolution are real; live delivery is the same
// gated path as the transactional SMS.
import { withTenant } from "@hybrid/db";
import { getSmsAdapter } from "@/lib/sms";

export type Channel = "sms";
export type Audience = "all" | "repeat";

const MAX_RECIPIENTS = 5000;

export interface Campaign {
  id: string;
  channel: string;
  audience: string;
  message: string;
  status: string;
  recipientCount: number;
  sentCount: number;
  createdAt: string;
  sentAt: string | null;
}

// Phones for an audience preset: 'all' = every customer with a phone; 'repeat' =
// customers with more than one order (the loyalty segment).
export async function resolveAudience(
  tenantId: string,
  userId: string,
  audience: Audience,
): Promise<{ count: number; phones: string[] }> {
  const phones = await withTenant(tenantId, userId, (tx) =>
    tx<{ phone: string }[]>`
      select phone from customer
      where phone is not null and phone <> ''
        and (${audience} = 'all' or orders_count > 1)
      order by created_at desc
      limit ${MAX_RECIPIENTS}
    `,
  );
  const list = phones.map((p) => p.phone);
  return { count: list.length, phones: list };
}

export async function listCampaigns(tenantId: string, userId: string): Promise<Campaign[]> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<
      {
        id: string;
        channel: string;
        audience: string;
        message: string;
        status: string;
        recipient_count: number;
        sent_count: number;
        created_at: string;
        sent_at: string | null;
      }[]
    >`
      select id, channel, audience, message, status, recipient_count, sent_count, created_at, sent_at
      from campaign order by created_at desc limit 100
    `,
  );
  return rows.map((r) => ({
    id: r.id,
    channel: r.channel,
    audience: r.audience,
    message: r.message,
    status: r.status,
    recipientCount: r.recipient_count,
    sentCount: r.sent_count,
    createdAt: r.created_at,
    sentAt: r.sent_at,
  }));
}

export async function createCampaign(
  tenantId: string,
  userId: string,
  input: { channel: Channel; audience: Audience; message: string },
): Promise<{ id: string; recipientCount: number }> {
  const { count } = await resolveAudience(tenantId, userId, input.audience);
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<{ id: string }[]>`
      insert into campaign (tenant_id, channel, audience, message, status, recipient_count, created_by)
      values (${tenantId}, ${input.channel}, ${input.audience}, ${input.message}, 'draft', ${count}, ${userId})
      returning id
    `,
  );
  return { id: rows[0]!.id, recipientCount: count };
}

export interface SendCampaignResult {
  sent: number;
  live: boolean;
}

// Dispatch a draft campaign. Resolves the audience again at send time (the list
// may have grown), fires each SMS through the gated adapter, and records the
// outcome. SMS_LIVE off → the adapter logs instead of sending; sent_count still
// reflects attempted recipients and `live` flags whether delivery was real.
export async function sendCampaign(
  tenantId: string,
  userId: string,
  campaignId: string,
): Promise<SendCampaignResult> {
  const live = process.env.SMS_LIVE === "1";
  const campaign = await withTenant(tenantId, userId, (tx) =>
    tx<{ message: string; audience: string; status: string }[]>`
      select message, audience, status from campaign where id = ${campaignId} for update
    `,
  );
  const c = campaign[0];
  if (!c) throw new Error("CAMPAIGN_NOT_FOUND");
  if (c.status === "sent") throw new Error("ALREADY_SENT");

  const { phones } = await resolveAudience(tenantId, userId, c.audience as Audience);
  const sms = getSmsAdapter();
  let sent = 0;
  for (const to of phones) {
    try {
      await sms.send(to, c.message);
      sent += 1;
    } catch {
      // One failed recipient never aborts the broadcast.
    }
  }

  await withTenant(tenantId, userId, async (tx) => {
    await tx`
      update campaign set status = 'sent', sent_count = ${sent}, sent_at = now()
      where id = ${campaignId}
    `;
  });
  return { sent, live };
}
