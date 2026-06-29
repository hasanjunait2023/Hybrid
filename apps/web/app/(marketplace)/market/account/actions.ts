"use server";

import { cookies } from "next/headers";
import { destroyBuyerSession, BUYER_SESSION_COOKIE } from "@/lib/marketplace/session";
import { redirect } from "next/navigation";

export async function logoutBuyerAction(): Promise<void> {
  const store = await cookies();
  const raw = store.get(BUYER_SESSION_COOKIE)?.value;
  if (raw) await destroyBuyerSession();
  redirect("/login");
}
