import Link from "next/link";
import { getBuyerSession } from "@/lib/marketplace/session";
import { asPlatformAdmin } from "@hybrid/db";
import { logoutBuyerAction } from "./actions";

async function getBuyerInfo(buyerId: string) {
  const rows = await asPlatformAdmin((tx) =>
    tx<{ phone: string; name: string | null }[]>`
      select phone, name from marketplace_customer where id = ${buyerId} limit 1
    `,
  );
  return rows[0] ?? null;
}

export default async function AccountPage() {
  const session = await getBuyerSession();
  if (!session) {
    return (
      <div className="py-12 text-center">
        <p className="text-ink-muted">আপনার অ্যাকাউন্ট দেখতে লগইন করুন।</p>
        <Link href="/login" className="mt-3 inline-block text-primary">
          লগইন
        </Link>
      </div>
    );
  }

  const buyer = await getBuyerInfo(session.buyerId);

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-lg font-semibold">আমার অ্যাকাউন্ট</h1>

      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="text-sm text-ink-muted">নাম</p>
        <p className="mt-1 font-medium text-ink">{buyer?.name ?? "—"}</p>
        <p className="mt-3 text-sm text-ink-muted">মোবাইল নম্বর</p>
        <p className="mt-1 font-medium text-ink">{buyer?.phone ?? "—"}</p>
      </div>

      <div className="flex flex-col gap-2">
        <Link
          href="/account/orders"
          className="flex min-h-[44px] items-center rounded-lg border border-border bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-2"
        >
          আমার অর্ডার
        </Link>
        <Link
          href="/account/addresses"
          className="flex min-h-[44px] items-center rounded-lg border border-border bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-2"
        >
          ঠিকানা বই 📍
        </Link>
        <Link
          href="/account/wishlist"
          className="flex min-h-[44px] items-center rounded-lg border border-border bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-2"
        >
          উইশলিস্ট ♥
        </Link>
      </div>

      <form action={logoutBuyerAction}>
        <button
          type="submit"
          className="min-h-[44px] w-full rounded-lg border border-danger px-4 text-sm font-medium text-danger hover:bg-danger/5"
        >
          লগআউট
        </button>
      </form>
    </div>
  );
}
