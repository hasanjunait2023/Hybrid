// Admin store-pages data layer (store_page). Sellers manage their static /
// policy pages (privacy, returns, terms, about, custom) here; the storefront
// renders the published ones at /pages/[slug]. Body is a plain-text block tree
// ([{type:'richtext', value}]) — no raw HTML is stored or rendered. All access
// via withTenant (RLS), never raw sql.
import { withTenant } from "@hybrid/db";

export type PageStatus = "draft" | "published";

export interface StorePageRow {
  id: string;
  type: string;
  slug: string;
  title: string;
  status: PageStatus;
  updatedAt: string;
}

export interface StorePageEdit extends StorePageRow {
  body: string;
  seoTitle: string;
  seoDescription: string;
}

interface PageBlock {
  type?: string;
  value?: string;
  content?: string;
}

function bodyFromBlocks(blocks: unknown): string {
  if (!Array.isArray(blocks)) return "";
  return (blocks as PageBlock[])
    .map((b) => b?.value ?? b?.content ?? "")
    .filter((s) => s.trim().length > 0)
    .join("\n\n");
}

export async function listStorePages(
  tenantId: string,
  userId: string,
): Promise<StorePageRow[]> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<
      { id: string; type: string; slug: string; title: string | null; status: PageStatus; updated_at: string }[]
    >`
      select id, type, slug, title, status, updated_at
        from store_page
       where type <> 'home'
       order by updated_at desc
    `,
  );
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    slug: r.slug,
    title: r.title ?? r.slug,
    status: r.status,
    updatedAt: r.updated_at,
  }));
}

export async function getStorePageBySlug(
  tenantId: string,
  userId: string,
  slug: string,
): Promise<StorePageEdit | null> {
  const row = await withTenant(tenantId, userId, async (tx) => {
    const rows = await tx<
      {
        id: string;
        type: string;
        slug: string;
        title: string | null;
        status: PageStatus;
        blocks: unknown;
        seo: { title?: string; description?: string } | null;
        updated_at: string;
      }[]
    >`
      select id, type, slug, title, status, blocks, seo, updated_at
        from store_page
       where slug = ${slug}
       limit 1
    `;
    return rows[0] ?? null;
  });
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    slug: row.slug,
    title: row.title ?? row.slug,
    status: row.status,
    updatedAt: row.updated_at,
    body: bodyFromBlocks(row.blocks),
    seoTitle: row.seo?.title ?? "",
    seoDescription: row.seo?.description ?? "",
  };
}

export interface UpsertStorePageInput {
  id?: string | null;
  type?: string;
  slug: string;
  title: string;
  body: string;
  status: PageStatus;
  seoTitle?: string;
  seoDescription?: string;
}

// Create or update a page. Returns the slug for cache invalidation. Slug
// collisions surface as a unique-violation the action maps to a friendly error.
export async function upsertStorePage(
  tenantId: string,
  userId: string,
  input: UpsertStorePageInput,
): Promise<{ slug: string }> {
  const blocks = [{ type: "richtext", value: input.body }];
  const seo = {
    ...(input.seoTitle ? { title: input.seoTitle } : {}),
    ...(input.seoDescription ? { description: input.seoDescription } : {}),
  };

  await withTenant(tenantId, userId, async (tx) => {
    if (input.id) {
      await tx`
        update store_page
           set title = ${input.title},
               slug = ${input.slug},
               status = ${input.status},
               blocks = ${tx.json(blocks)},
               seo = ${tx.json(seo)},
               updated_at = now()
         where id = ${input.id} and tenant_id = ${tenantId}
      `;
    } else {
      await tx`
        insert into store_page (tenant_id, type, slug, title, status, blocks, seo)
        values (
          ${tenantId}, ${input.type ?? "custom"}, ${input.slug}, ${input.title},
          ${input.status}, ${tx.json(blocks)}, ${tx.json(seo)}
        )
      `;
    }
  });
  return { slug: input.slug };
}

export async function deleteStorePage(
  tenantId: string,
  userId: string,
  id: string,
): Promise<{ slug: string | null }> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<{ slug: string }[]>`
      delete from store_page
       where id = ${id} and tenant_id = ${tenantId} and type <> 'home'
      returning slug
    `,
  );
  return { slug: rows[0]?.slug ?? null };
}
