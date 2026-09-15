import { NextResponse } from "next/server";
import { clearSessionCookies } from "@/lib/session";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  // Both cookies, not just the access token — a surviving refresh token would
  // let the keepalive mint a new session straight after signing out.
  clearSessionCookies(response);
  return response;
}
