// Dev-only auth stub. Issues the signed `hybrid_dev_session` cookie used by
// getSession(). GUARDED: returns 404 in production. Phase 1 replaces this with
// real Supabase Auth; getSession() callers are unaffected.
//
//   GET /dev-login?as=owner-a | owner-b | admin
import { NextResponse, type NextRequest } from "next/server";
import { DEV_SESSION_COOKIE, DEV_USERS, signDevCookie } from "@/lib/auth/session";

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not found", { status: 404 });
  }

  const as = req.nextUrl.searchParams.get("as");
  const userId = as && as in DEV_USERS ? DEV_USERS[as as keyof typeof DEV_USERS] : null;
  if (!userId) {
    return new NextResponse("Pass ?as=owner-a|owner-b|admin", { status: 400 });
  }

  // signDevCookie uses the fail-fast DEV_SESSION_SECRET (throws if unset).
  const value = signDevCookie(userId);

  const res = NextResponse.redirect(new URL("/admin", req.url));
  res.cookies.set(DEV_SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  return res;
}
