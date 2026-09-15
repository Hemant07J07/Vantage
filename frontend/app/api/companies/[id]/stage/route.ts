import { NextRequest, NextResponse } from "next/server";
import { backendFetch } from "@/lib/api";

/**
 * Moves an account between pipeline stages.
 *
 * Django is the one enforcing which stages may be set — this handler passes
 * the request straight through rather than validating a second time, so the
 * two can't drift apart on what "manual" means.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  try {
    const data = await backendFetch(`/companies/${id}/stage/`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ detail: String(err) }, { status: 502 });
  }
}
