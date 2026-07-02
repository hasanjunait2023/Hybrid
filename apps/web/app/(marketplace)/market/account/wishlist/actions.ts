"use server";

import { getBuyerSession } from "@/lib/marketplace/session";
import {
  addToWishlist,
  removeFromWishlist,
} from "@/lib/marketplace/wishlist";

export async function addWishlistAction(
  productId: string,
  listingId: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await getBuyerSession();
  if (!session) return { ok: false, error: "needsLogin" };
  await addToWishlist(session.buyerId, productId, listingId);
  return { ok: true };
}

export async function removeWishlistAction(
  productId: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await getBuyerSession();
  if (!session) return { ok: false, error: "needsLogin" };
  await removeFromWishlist(session.buyerId, productId);
  return { ok: true };
}
