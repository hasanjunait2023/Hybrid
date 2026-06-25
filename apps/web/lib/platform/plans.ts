// Plans & limits (tenant roadmap PP1-A4). Plan CRUD for the super-admin +
// the limit-enforcement helper. The `plan` table is a platform table (public
// read; is_platform_admin write per 02_policies.sql) — writes run under
// asPlatformAdmin which sets app.is_platform_admin.
import { asPlatformAdmin } from "@hybrid/db";

export interface Plan {
  id: string;
  code: string;
  name: string;
  priceBdt: number;
  billingInterval: string;
  maxProducts: number | null;
  maxOrdersMonth: number | null;
  maxCustomDomains: number;
  maxStaff: number;
  isActive: boolean;
  sortOrder: number;
}

export interface PlanInput {
  code: string;
  name: string;
  priceBdt: number;
  billingInterval: "monthly" | "yearly";
  maxProducts: number | null;
  maxOrdersMonth: number | null;
  maxCustomDomains: number;
  maxStaff: number;
  isActive: boolean;
  sortOrder: number;
}

function mapPlan(r: {
  id: string; code: string; name: string; price_bdt: string; billing_interval: string;
  max_products: number | null; max_orders_month: number | null; max_custom_domains: number;
  max_staff: number; is_active: boolean; sort_order: number;
}): Plan {
  return {
    id: r.id, code: r.code, name: r.name, priceBdt: Number(r.price_bdt),
    billingInterval: r.billing_interval, maxProducts: r.max_products, maxOrdersMonth: r.max_orders_month,
    maxCustomDomains: r.max_custom_domains, maxStaff: r.max_staff, isActive: r.is_active, sortOrder: r.sort_order,
  };
}

export async function listPlans(): Promise<Plan[]> {
  const rows = await asPlatformAdmin((tx) =>
    tx<Parameters<typeof mapPlan>[0][]>`
      select id, code, name, price_bdt, billing_interval, max_products, max_orders_month,
             max_custom_domains, max_staff, is_active, sort_order
      from plan order by sort_order asc, price_bdt asc
    `,
  );
  return rows.map(mapPlan);
}

export async function createPlan(input: PlanInput): Promise<{ id: string }> {
  const rows = await asPlatformAdmin((tx) =>
    tx<{ id: string }[]>`
      insert into plan (code, name, price_bdt, billing_interval, max_products, max_orders_month,
                        max_custom_domains, max_staff, is_active, sort_order)
      values (${input.code}, ${input.name}, ${input.priceBdt}, ${input.billingInterval},
              ${input.maxProducts}, ${input.maxOrdersMonth}, ${input.maxCustomDomains},
              ${input.maxStaff}, ${input.isActive}, ${input.sortOrder})
      returning id
    `,
  );
  return { id: rows[0]!.id };
}

export async function updatePlan(id: string, input: PlanInput): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    await tx`
      update plan set
        code = ${input.code}, name = ${input.name}, price_bdt = ${input.priceBdt},
        billing_interval = ${input.billingInterval}, max_products = ${input.maxProducts},
        max_orders_month = ${input.maxOrdersMonth}, max_custom_domains = ${input.maxCustomDomains},
        max_staff = ${input.maxStaff}, is_active = ${input.isActive}, sort_order = ${input.sortOrder},
        updated_at = now()
      where id = ${id}
    `;
  });
}

export async function setPlanActive(id: string, active: boolean): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    await tx`update plan set is_active = ${active}, updated_at = now() where id = ${id}`;
  });
}

export type LimitResource = "product" | "order" | "staff" | "domain";

export interface LimitCheck {
  allowed: boolean;
  used: number;
  limit: number | null; // null = unlimited
}

// Enforcement helper: is a tenant within its plan limit for a resource? Tenant
// product/order/staff/domain create paths call this before inserting. Uses the
// tenant's plan limits + a live usage count (orders counted for the current
// Dhaka month). Unlimited (null limit) always allowed.
export async function checkPlanLimit(tenantId: string, resource: LimitResource): Promise<LimitCheck> {
  return asPlatformAdmin(async (tx) => {
    const lim = await tx<{ max_products: number | null; max_orders_month: number | null; max_staff: number; max_custom_domains: number }[]>`
      select p.max_products, p.max_orders_month, p.max_staff, p.max_custom_domains
      from tenant t left join plan p on p.id = t.plan_id where t.id = ${tenantId}
    `;
    const l = lim[0];
    if (!l) return { allowed: false, used: 0, limit: 0 };

    const limit =
      resource === "product" ? l.max_products
        : resource === "order" ? l.max_orders_month
        : resource === "staff" ? l.max_staff
        : l.max_custom_domains;

    const usedRows = await tx<{ n: number }[]>`
      select (
        case
          when ${resource} = 'product' then (select count(*) from product where tenant_id = ${tenantId})
          when ${resource} = 'staff'   then (select count(*) from tenant_member where tenant_id = ${tenantId})
          when ${resource} = 'domain'  then (select count(*) from tenant_domain where tenant_id = ${tenantId})
          else (select count(*) from orders where tenant_id = ${tenantId}
                and date_trunc('month', placed_at at time zone 'Asia/Dhaka') = date_trunc('month', now() at time zone 'Asia/Dhaka'))
        end
      )::int as n
    `;
    const used = usedRows[0]?.n ?? 0;
    return { allowed: limit == null || used < limit, used, limit };
  });
}
