"use client";

import { useEffect, useState } from "react";
import { Badge, ProgressMeter } from "@/components/ui";
import type { AIHealth } from "@/lib/types";

/**
 * The one integration that actually exists: the AI service and the hosted
 * model provider (Groq) behind it.
 *
 * Everything here is read live from `/api/ai/health/` rather than configured
 * in the UI — including the model name, which would otherwise keep reading
 * correct after someone changed GROQ_MODEL.
 */
export function OllamaConnection() {
  const [health, setHealth] = useState<AIHealth | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch("/api/ai/health", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as AIHealth;
        if (!cancelled) {
          setHealth(data);
          setFailed(false);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    }

    poll();
    const timer = setInterval(poll, 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // "Checking" is its own state. Before the first response has landed we
  // haven't established anything, and reporting "Unreachable" there would
  // assert a failure that hasn't happened.
  const state =
    failed
      ? { tone: "danger" as const, label: "Unreachable" }
      : !health
        ? { tone: "neutral" as const, label: "Checking" }
        : !health.service_reachable
        ? { tone: "danger" as const, label: "Service down" }
        : !health.model_reachable
          ? { tone: "warn" as const, label: "Model provider offline" }
          : health.model_available === false
            ? { tone: "warn" as const, label: "Model unavailable" }
            : { tone: "ok" as const, label: "Connected" };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-[15px] font-semibold text-hi">
            AI Model
          </p>
          <p className="mt-1 font-mono text-[11px] text-faint">
            Cloud inference (Groq)
          </p>
        </div>
        <Badge tone={state.tone} variant="pill" dot>
          {state.label}
        </Badge>
      </div>

      {health ? (
        <>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs text-muted">Model</span>
            <span className="font-mono text-[11px] text-body truncate">
              {health.model_label || health.model || "—"}
            </span>
          </div>
          <ProgressMeter
            label="Research today"
            value={health.requests_today}
            limit={health.requests_limit}
          />
        </>
      ) : (
        <p className="text-xs text-muted">
          {failed
            ? "Couldn't reach the AI service."
            : "Checking connection…"}
        </p>
      )}
    </div>
  );
}
