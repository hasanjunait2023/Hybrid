import { getBuyerSession } from "@/lib/marketplace/session";
import { listBuyerAddresses } from "@/lib/marketplace/addresses";
import { CheckoutForm } from "./CheckoutForm";

export default async function CheckoutPage() {
  const session = await getBuyerSession();
  const savedAddresses = session ? await listBuyerAddresses(session.buyerId) : [];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">চেকআউট</h1>
      <CheckoutForm savedAddresses={savedAddresses} />
    </div>
  );
}
