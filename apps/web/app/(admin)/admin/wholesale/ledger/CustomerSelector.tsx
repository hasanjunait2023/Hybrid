"use client";

// Customer selector dropdown for the ledger page.
import { useRouter } from "next/navigation";

interface CustomerOption {
  id: string;
  name: string | null;
  phone: string | null;
  businessName: string | null;
}

export function CustomerSelector({
  customers,
  selectedCustomerId,
  label,
  placeholder,
}: {
  customers: CustomerOption[];
  selectedCustomerId?: string;
  label: string;
  placeholder: string;
}) {
  const router = useRouter();

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <label className="mb-1 block text-xs font-medium text-ink-muted">
        {label}
      </label>
      <select
        className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
        onChange={(e) => {
          if (e.target.value) {
            router.push(`/admin/wholesale/ledger?customerId=${e.target.value}`);
          } else {
            router.push("/admin/wholesale/ledger");
          }
        }}
        defaultValue={selectedCustomerId ?? ""}
      >
        <option value="">{placeholder}</option>
        {customers.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name ?? c.phone ?? "—"} {c.businessName ? `(${c.businessName})` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
