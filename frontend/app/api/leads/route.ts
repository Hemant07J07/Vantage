import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL || "http://backend:8000";

/**
 * Public lead-intake endpoint. Proxied through Next.js (rather than the
 * client posting straight to Django) so the marketing site / landing page
 * embedding this form never needs to know the backend's real address, and
 * so we have one place to add rate limiting or spam checks later.
 *
 * This one intentionally does NOT require the auth cookie — lead
 * submission is public. Django's LeadViewSet.create() also allows anonymous
 * access for exactly this endpoint.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();

  const res = await fetch(`${BACKEND_URL}/api/leads/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
