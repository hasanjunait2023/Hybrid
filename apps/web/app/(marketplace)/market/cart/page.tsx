import { CartIsland } from "./CartIsland";

export default function CartPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">কার্ট</h1>
      <CartIsland />
    </div>
  );
}
