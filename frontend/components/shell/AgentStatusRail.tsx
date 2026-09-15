"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { APP_VERSION } from "@/lib/constants";
import { ProgressMeter } from "@/components/ui";
import type { AIHealth } from "@/lib/types";

/**
 * The sidebar's AI status rail.
 *
 * Everything here is read from the live `/api/ai/health/` endpoint — including
 * the model name. Hardcoding a label like "Qwen 3 (32B, Groq)" would keep
 * reading correct after someone changed GROQ_MODEL, which is exactly when you
 * most want it to be right.
 */
export function AgentStatusRail() {
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

  // Distinguishable states, because "the AI service is down" and "the model
  // provider is down" need different fixes and shouldn't look identical.
  //
  // "Checking" is deliberately separate from "Unreachable": on first paint no
  // request has completed yet, and reporting a failure there would claim an
  // outage that hasn't been observed.
  const status = failed
    ? { tone: "bg-danger", label: "Unreachable" }
    : !health
      ? { tone: "bg-faint", label: "Checking…" }
      : !health.service_reachable
        ? { tone: "bg-danger", label: "Service down" }
        : !health.model_reachable
          ? { tone: "bg-warn", label: "Model provider offline" }
          : health.model_available === false
            ? { tone: "bg-warn", label: "Model unavailable" }
            : { tone: "bg-ok", label: "Operational" };

  return (
    // Collapsed, only the status dot shows. Everything beside it fades via
    // `.rail-reveal` rather than being cropped at the rail edge — cropping is
    // what left half-words ("Resear", "Vantag") hanging at the boundary.
    <div className="shrink-0 border-t border-line py-3.5">
      {/* 31px puts the 6px status dot's centre at 34px — the rail's spine,
          shared with the nav icons and the logo glyph, so the three line up
          in a single column while collapsed. */}
      <div className="w-[236px] shrink-0 px-[31px] space-y-3">
        <div className="flex items-center gap-3.5">
          <span
            className={cn(
              "w-1.5 h-1.5 rounded-full shrink-0",
              status.tone,
              status.label === "Operational" && "animate-pulse-dot"
            )}
            title={`AI agent: ${status.label}`}
          />
          <div className="rail-reveal min-w-0">
            <p className="label-mono text-faint">AI Agent</p>
            <p className="text-xs text-body truncate mt-0.5">{status.label}</p>
          </div>
        </div>

        {health && (
          <div className="rail-reveal space-y-3">
            <ProgressMeter
              label="Research today"
              value={health.requests_today}
              limit={health.requests_limit}
            />
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] text-muted">Model</span>
              <span className="text-[11px] font-mono text-body truncate">
                {health.model_label || health.model || "—"}
              </span>
            </div>
          </div>
        )}

        <p className="rail-reveal font-mono text-[10px] text-faint pt-1">
          Vantage v{APP_VERSION}
        </p>
      </div>
    </div>
  );
}
