import { CheckoutForm } from "./CheckoutForm";

export default function CheckoutPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">চেকআউট</h1>
      <CheckoutForm />
    </div>
  );
}
