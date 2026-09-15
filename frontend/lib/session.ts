/**
 * Session cookie handling, shared by the login, register, refresh and logout
 * route handlers so the four never drift apart on flags or lifetimes.
 */
import "server-only";
import type { NextResponse } from "next/server";
import {
  ACCESS_MAX_AGE,
  REFRESH_COOKIE,
  REFRESH_MAX_AGE,
  TOKEN_COOKIE,
} from "./api";

const BASE = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
} as const;

export function setAccessCookie(response: NextResponse, access: string) {
  response.cookies.set(TOKEN_COOKIE, access, { ...BASE, maxAge: ACCESS_MAX_AGE });
}

export function setSessionCookies(
  response: NextResponse,
  tokens: { access: string; refresh: string }
) {
  setAccessCookie(response, tokens.access);
  // The access token expires after 8 hours. Without the refresh token stored
  // alongside it, that was a hard cap on a session — everyone got signed out
  // mid-day with no way to renew.
  response.cookies.set(REFRESH_COOKIE, tokens.refresh, {
    ...BASE,
    maxAge: REFRESH_MAX_AGE,
  });
}

export function clearSessionCookies(response: NextResponse) {
  response.cookies.delete(TOKEN_COOKIE);
  response.cookies.delete(REFRESH_COOKIE);
}
