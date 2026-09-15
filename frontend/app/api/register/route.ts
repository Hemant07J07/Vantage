import { NextRequest, NextResponse } from "next/server";
import { register } from "@/lib/api";
import { setSessionCookies } from "@/lib/session";

export async function POST(request: NextRequest) {
  const { username, email, password } = await request.json();
  if (!username || !password) {
    return NextResponse.json(
      { detail: "Username and password are required." },
      { status: 400 }
    );
  }

  const result = await register(username, email ?? "", password);
  if (!result.ok) {
    return NextResponse.json({ detail: result.detail }, { status: result.status });
  }

  // Django issues tokens with the new account, so registering signs you in.
  const response = NextResponse.json({ ok: true });
  setSessionCookies(response, result.tokens);
  return response;
}
