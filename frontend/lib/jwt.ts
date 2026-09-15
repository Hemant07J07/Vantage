/**
 * Reading a JWT's expiry without verifying it.
 *
 * This is a UX gate, not a security check. The signature is deliberately not
 * verified: the Edge runtime has no Node crypto, and it doesn't need it —
 * Django remains the only authority on whether a token is real. All this
 * decides is whether to bother sending a request that would certainly 401,
 * so an expired session becomes a quiet redirect instead of an error page.
 *
 * Kept out of lib/session.ts because that module is `server-only` and proxy.ts
 * needs this too.
 */

/** True if the token is absent, unparseable, or past its `exp`. */
export function isExpired(token: string | undefined): boolean {
  if (!token) return true;

  const payload = token.split(".")[1];
  if (!payload) return true;

  try {
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const { exp } = JSON.parse(json) as { exp?: number };
    if (typeof exp !== "number") return true;
    return exp * 1000 <= Date.now();
  } catch {
    // Anything we can't read is treated as expired — the failure mode is one
    // unnecessary sign-in, rather than letting a malformed token through.
    return true;
  }
}
