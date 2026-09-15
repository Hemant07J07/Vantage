import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { refreshAccess, REFRESH_COOKIE } from "@/lib/api";
import { clearSessionCookies, setAccessCookie } from "@/lib/session";

/**
 * Exchanges the stored refresh token for a fresh access token.
 *
 * Called by SessionKeepalive rather than from the data-fetching path: a Server
 * Component can read cookies but cannot write them, so the renewal has to
 * happen in a route handler like this one.
 */
export async function POST() {
  const store = await cookies();
  const refresh = store.get(REFRESH_COOKIE)?.value;
  if (!refresh) {
    return NextResponse.json({ detail: "No session." }, { status: 401 });
  }

  const tokens = await refreshAccess(refresh);
  if (!tokens) {
    // The refresh token is spent or invalid; drop both cookies so the next
    // request is a clean redirect to sign-in rather than a confusing 401 loop.
    const expired = NextResponse.json({ detail: "Session expired." }, { status: 401 });
    clearSessionCookies(expired);
    return expired;
  }

  const response = NextResponse.json({ ok: true });
  setAccessCookie(response, tokens.access);
  return response;
}
