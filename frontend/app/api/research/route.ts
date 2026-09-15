import { NextResponse } from "next/server";

/**
 * Public research proxy.
 *
 * Deliberately attaches NO auth cookie — this is the anonymous front door.
 *
 * It does forward X-Forwarded-For, and that is load-bearing: Django sees every
 * request from this container's IP, so without the real client address its
 * rate limiter would treat all visitors on Earth as one bucket and the fifth
 * research of the hour would lock out everybody else.
 */
const BACKEND_URL = process.env.BACKEND_INTERNAL_URL || "http://backend:8000";

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "";
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ detail: "Invalid request body." }, { status: 400 });
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const ip = clientIp(request);
  if (ip) headers["X-Forwarded-For"] = ip;

  try {
    const res = await fetch(`${BACKEND_URL}/api/research/`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      cache: "no-store",
    });

    // Read as text first: an error from a proxy in front of Django may not be
    // JSON, and blindly calling res.json() would throw instead of reporting it.
    const text = await res.text();
    try {
      return NextResponse.json(JSON.parse(text), { status: res.status });
    } catch {
      return NextResponse.json(
        { detail: text.slice(0, 300) || "Unexpected response from the server." },
        { status: res.status }
      );
    }
  } catch (error) {
    console.error("research proxy failed", error);
    return NextResponse.json(
      { detail: "Could not reach the research service." },
      { status: 502 }
    );
  }
}
