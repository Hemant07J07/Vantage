import { NextRequest, NextResponse } from "next/server";
import { backendFetch } from "@/lib/api";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const data = await backendFetch(`/leads/${id}/requalify/`, { method: "POST" });
    return NextResponse.json(data ?? { ok: true });
  } catch (err) {
    return NextResponse.json({ detail: String(err) }, { status: 502 });
  }
}
