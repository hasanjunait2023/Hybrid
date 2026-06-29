"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getBuyerSession } from "@/lib/marketplace/session";
import {
  saveBuyerAddress,
  updateBuyerAddress,
  setDefaultAddress,
  deleteBuyerAddress,
} from "@/lib/marketplace/addresses";

const addressSchema = z.object({
  label: z.string().trim().max(30).optional(),
  recipientName: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(11).max(20),
  division: z.string().trim().min(1).max(60),
  district: z.string().trim().min(1).max(60),
  thana: z.string().trim().min(1).max(60),
  addressLine: z.string().trim().min(1).max(240),
  isDefault: z.boolean().optional(),
});

export interface AddressActionResult {
  ok: boolean;
  error?: string;
}

export async function addAddressAction(raw: unknown): Promise<AddressActionResult> {
  const session = await getBuyerSession();
  if (!session) return { ok: false, error: "লগইন প্রয়োজন।" };
  const parsed = addressSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "তথ্য সম্পূর্ণ নয়।" };
  await saveBuyerAddress(session.buyerId, parsed.data);
  revalidatePath("/account/addresses");
  return { ok: true };
}

export async function editAddressAction(id: string, raw: unknown): Promise<AddressActionResult> {
  const session = await getBuyerSession();
  if (!session) return { ok: false, error: "লগইন প্রয়োজন।" };
  const parsed = addressSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "তথ্য সম্পূর্ণ নয়।" };
  await updateBuyerAddress(session.buyerId, id, parsed.data);
  revalidatePath("/account/addresses");
  return { ok: true };
}

export async function setDefaultAddressAction(id: string): Promise<void> {
  const session = await getBuyerSession();
  if (!session) return;
  await setDefaultAddress(session.buyerId, id);
  revalidatePath("/account/addresses");
}

export async function deleteAddressAction(id: string): Promise<void> {
  const session = await getBuyerSession();
  if (!session) return;
  await deleteBuyerAddress(session.buyerId, id);
  revalidatePath("/account/addresses");
}
