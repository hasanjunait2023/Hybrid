import Link from "next/link";
import { getBuyerSession } from "@/lib/marketplace/session";
import { listBuyerAddresses } from "@/lib/marketplace/addresses";
import { AddressManager } from "./AddressManager";

export default async function AddressesPage() {
  const session = await getBuyerSession();
  if (!session) {
    return (
      <div className="py-12 text-center">
        <p className="text-ink-muted">ঠিকানা বই দেখতে লগইন করুন।</p>
        <Link href="/login?next=/account/addresses" className="mt-3 inline-block text-primary">
          লগইন
        </Link>
      </div>
    );
  }

  const addresses = await listBuyerAddresses(session.buyerId);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Link href="/account" className="text-sm text-ink-muted hover:text-primary">
          ← অ্যাকাউন্ট
        </Link>
        <h1 className="text-lg font-semibold">আমার ঠিকানা বই</h1>
      </div>
      <AddressManager initial={addresses} />
    </div>
  );
}
