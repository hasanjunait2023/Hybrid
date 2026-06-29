"use client";

import { useState, useTransition } from "react";
import type { BuyerAddress } from "@/lib/marketplace/addresses";
import {
  addAddressAction,
  editAddressAction,
  setDefaultAddressAction,
  deleteAddressAction,
} from "./actions";

interface FormState {
  label: string;
  recipientName: string;
  phone: string;
  division: string;
  district: string;
  thana: string;
  addressLine: string;
  isDefault: boolean;
}

const EMPTY: FormState = {
  label: "",
  recipientName: "",
  phone: "",
  division: "",
  district: "",
  thana: "",
  addressLine: "",
  isDefault: false,
};

function fromAddress(a: BuyerAddress): FormState {
  return {
    label: a.label ?? "",
    recipientName: a.recipientName,
    phone: a.phone,
    division: a.division,
    district: a.district,
    thana: a.thana,
    addressLine: a.addressLine,
    isDefault: a.isDefault,
  };
}

const FIELDS: [keyof FormState, string, string][] = [
  ["recipientName", "প্রাপকের নাম", "text"],
  ["phone", "মোবাইল নম্বর", "tel"],
  ["division", "বিভাগ", "text"],
  ["district", "জেলা", "text"],
  ["thana", "থানা/উপজেলা", "text"],
  ["addressLine", "সম্পূর্ণ ঠিকানা", "text"],
  ["label", 'লেবেল (যেমন "বাড়ি")', "text"],
];

export function AddressManager({ initial }: { initial: BuyerAddress[] }) {
  const [addresses, setAddresses] = useState(initial);
  const [editing, setEditing] = useState<BuyerAddress | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.currentTarget.checked : e.target.value }));

  const openAdd = () => { setAdding(true); setEditing(null); setForm(EMPTY); setError(null); };
  const openEdit = (a: BuyerAddress) => { setEditing(a); setAdding(false); setForm(fromAddress(a)); setError(null); };
  const closeForm = () => { setAdding(false); setEditing(null); };

  const save = () => {
    startTransition(async () => {
      const input = { ...form, label: form.label.trim() || undefined };
      const res = editing
        ? await editAddressAction(editing.id, input)
        : await addAddressAction(input);
      if (!res.ok) { setError(res.error ?? "ত্রুটি হয়েছে।"); return; }
      // Optimistic: reload page to reflect server state (revalidatePath fired)
      window.location.reload();
    });
  };

  const makeDefault = (id: string) => {
    startTransition(async () => {
      await setDefaultAddressAction(id);
      setAddresses((prev) => prev.map((a) => ({ ...a, isDefault: a.id === id })));
    });
  };

  const del = (id: string) => {
    startTransition(async () => {
      await deleteAddressAction(id);
      setAddresses((prev) => prev.filter((a) => a.id !== id));
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {addresses.map((a) => (
        <div key={a.id} className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-medium text-ink">
                {a.recipientName}
                {a.label ? <span className="ml-2 text-xs text-ink-muted">({a.label})</span> : null}
                {a.isDefault ? <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">ডিফল্ট</span> : null}
              </p>
              <p className="mt-1 text-sm text-ink-muted">{a.phone}</p>
              <p className="text-sm text-ink-muted">
                {a.addressLine}, {a.thana}, {a.district}, {a.division}
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {!a.isDefault && (
              <button
                type="button"
                onClick={() => makeDefault(a.id)}
                disabled={pending}
                className="text-xs text-primary hover:underline disabled:opacity-50"
              >
                ডিফল্ট করুন
              </button>
            )}
            <button
              type="button"
              onClick={() => openEdit(a)}
              className="text-xs text-primary hover:underline"
            >
              সম্পাদনা
            </button>
            <button
              type="button"
              onClick={() => del(a.id)}
              disabled={pending}
              className="text-xs text-danger hover:underline disabled:opacity-50"
            >
              মুছুন
            </button>
          </div>
        </div>
      ))}

      {!adding && !editing && (
        <button
          type="button"
          onClick={openAdd}
          className="min-h-[44px] rounded-lg border border-dashed border-border bg-surface px-4 text-sm text-ink-muted hover:border-primary hover:text-primary"
        >
          + নতুন ঠিকানা যোগ করুন
        </button>
      )}

      {(adding || editing) && (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
          <p className="font-medium text-ink">{editing ? "ঠিকানা সম্পাদনা" : "নতুন ঠিকানা"}</p>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          {FIELDS.map(([k, label, type]) => (
            <input
              key={k}
              type={type}
              placeholder={label}
              value={form[k] as string}
              onChange={set(k)}
              className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm"
            />
          ))}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={set("isDefault")}
              className="accent-primary"
            />
            ডিফল্ট ঠিকানা হিসেবে সেট করুন
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="min-h-[44px] rounded-md bg-primary px-5 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
            >
              সংরক্ষণ করুন
            </button>
            <button
              type="button"
              onClick={closeForm}
              className="min-h-[44px] rounded-md border border-border px-5 text-sm text-ink-muted hover:bg-surface-2"
            >
              বাতিল
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
