import { NextResponse } from "next/server";
import { backendFetch } from "@/lib/api";
import type { AIHealth } from "@/lib/types";

/** Authenticated proxy for the sidebar's agent-status rail. */
export async function GET() {
  try {
    return NextResponse.json(await backendFetch<AIHealth>("/ai/health/"));
  } catch (error) {
    console.error("ai health proxy failed", error);
    return NextResponse.json(
      { detail: "Could not reach the AI service." },
      { status: 502 }
    );
  }
}
