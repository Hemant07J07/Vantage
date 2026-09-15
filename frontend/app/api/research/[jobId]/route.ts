import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL || "http://backend:8000";

/** Public poll target for a research job. No auth cookie, forwards client IP. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  const headers: Record<string, string> = {};
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) headers["X-Forwarded-For"] = forwarded.split(",")[0].trim();

  try {
    const res = await fetch(`${BACKEND_URL}/api/research/${jobId}/`, {
      headers,
      cache: "no-store",
    });
    const text = await res.text();
    try {
      return NextResponse.json(JSON.parse(text), { status: res.status });
    } catch {
      return NextResponse.json(
        { detail: "Unexpected response from the server." },
        { status: res.status }
      );
    }
  } catch (error) {
    console.error("research poll proxy failed", error);
    return NextResponse.json(
      { detail: "Could not reach the research service." },
      { status: 502 }
    );
  }
}
