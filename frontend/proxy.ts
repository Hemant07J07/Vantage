import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isExpired } from "@/lib/jwt";

/**
 * Auth gate. (Next 16 renamed `middleware` to `proxy`.)
 *
 * Checks that a session cookie exists AND hasn't expired, but not that its
 * signature is real — verifying that needs Node crypto, which the Edge runtime
 * doesn't offer. Django does the real validation, and `lib/api.ts` turns its
 * 401 into a redirect; this gate exists so the common cases never get that far.
 *
 * Presence alone used to be enough here, and that was the bug behind "Something
 * went wrong" on /dashboard: a token invalidated by a secret-key rotation still
 * looked like a session, so the gate waved it through and the render died on a
 * 401 it couldn't recover from.
 *
 * ── Why exact-match matters ───────────────────────────────────────────────
 * This list used to be prefix-matched with `startsWith`. That's fine while
 * every public route is something like "/login", but the landing page lives at
 * "/" — and `"/dashboard".startsWith("/")` is true, so adding "/" to a
 * prefix list would silently make the ENTIRE app public with no visible error.
 *
 * Hence two separate lists: exact paths, and prefixes that are genuinely
 * hierarchical. Anything not matched requires the cookie.
 */

// /register belongs here for the obvious reason: someone who has no account
// can't sign in to reach the page that creates one.
const PUBLIC_EXACT = new Set(["/", "/login", "/register"]);

const PUBLIC_PREFIXES = [
  "/research/", // shareable research permalinks
  "/_next",
  "/favicon",
  "/icon",
  "/apple-icon",
  "/opengraph-image",
  "/robots.txt",
  "/sitemap.xml",
];

function isPublic(pathname: string): boolean {
  return (
    PUBLIC_EXACT.has(pathname) ||
    PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  const access = request.cookies.get("vantage_token")?.value;
  if (!isExpired(access)) {
    return NextResponse.next();
  }

  // The access token is gone or stale, but the 7-day refresh token may still be
  // good — a visitor coming back the next morning should land where they were
  // headed, not on a sign-in form. This hop swaps it for a fresh access token
  // and continues; it needs to be a route handler because only one of those may
  // write cookies.
  if (request.cookies.get("vantage_refresh")?.value) {
    const renew = new URL("/api/session/renew", request.url);
    renew.searchParams.set("next", pathname);
    return NextResponse.redirect(renew);
  }

  // Nothing left to renew from: sign out silently rather than showing an error.
  const url = new URL("/login", request.url);
  // Send them back where they were headed once they've signed in.
  url.searchParams.set("next", pathname);
  const response = NextResponse.redirect(url);
  response.cookies.delete("vantage_token");
  response.cookies.delete("vantage_refresh");
  return response;
}

export const config = {
  // Static files are excluded by extension rather than listed one by one, so
  // adding an asset to public/ can't accidentally end up behind the auth gate.
  // (The brand logo did exactly that: /vantage-mark.png was answering 307 to
  // /login, so the mark silently failed to render for signed-out visitors.)
  // Every real route in this app is extensionless, so nothing sensitive can
  // match here.
  matcher: [
    "/((?!api|_next/static|_next/image|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|ttf|otf|txt|xml|webmanifest)$).*)",
  ],
};
