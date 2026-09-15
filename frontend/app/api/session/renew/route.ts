import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { refreshAccess, REFRESH_COOKIE } from "@/lib/api";
import { clearSessionCookies, setAccessCookie } from "@/lib/session";

/**
 * The silent re-auth hop.
 *
 * `proxy.ts` sends a visitor here when their access token has expired but their
 * refresh token hasn't. This swaps one for the other and bounces them onward,
 * so coming back the next day looks like staying signed in rather than being
 * logged out. When the refresh token is spent too, it becomes a silent sign-out
 * instead: cookies cleared, straight to the sign-in form, no error screen.
 *
 * It's a GET because a redirect lands here, and a route handler because a
 * Server Component can read cookies but not write them.
 *
 * Distinct from POST /api/refresh, which SessionKeepalive calls in the
 * background from an open tab and which answers JSON rather than redirecting.
 */
export async function GET(request: NextRequest) {
  // Same-origin paths only, so a crafted ?next= can't turn the renewal hop
  // into an open redirect. Mirrors the guard on the sign-in form.
  const requested = request.nextUrl.searchParams.get("next") || "/dashboard";
  const next = requested.startsWith("/") && !requested.startsWith("//")
    ? requested
    : "/dashboard";

  const store = await cookies();
  const refresh = store.get(REFRESH_COOKIE)?.value;

  const tokens = refresh ? await refreshAccess(refresh) : null;

  if (!tokens) {
    const response = redirectTo(`/login?next=${encodeURIComponent(next)}`);
    clearSessionCookies(response);
    return response;
  }

  const response = redirectTo(next);
  setAccessCookie(response, tokens.access);
  return response;
}

/**
 * Redirect to a path on this same origin.
 *
 * Built by hand with a relative `Location` rather than `NextResponse.redirect`,
 * which needs an absolute URL: inside Docker, `request.url` resolves to the
 * container's own hostname, so it produced links like `http://9152899e9190:3000/...`
 * that no browser outside the compose network can follow. A relative Location
 * is resolved by the client against whatever address it actually used.
 */
function redirectTo(path: string): NextResponse {
  return new NextResponse(null, { status: 307, headers: { Location: path } });
}
