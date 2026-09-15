import { NextRequest, NextResponse } from "next/server";
import { login } from "@/lib/api";
import { setSessionCookies } from "@/lib/session";

export async function POST(request: NextRequest) {
  const { username, password } = await request.json();
  if (!username || !password) {
    return NextResponse.json({ detail: "Username and password are required." }, { status: 400 });
  }

  const tokens = await login(username, password);
  if (!tokens) {
    return NextResponse.json({ detail: "Invalid credentials." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  setSessionCookies(response, tokens);
  return response;
}
