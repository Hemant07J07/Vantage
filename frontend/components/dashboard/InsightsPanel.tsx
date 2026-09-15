import Link from "next/link";
import { ChevronRight, Lightbulb } from "lucide-react";
import { EmptyState } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { Insight } from "@/lib/types";

const TONES: Record<Insight["tone"], string> = {
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  info: "bg-info-soft text-info",
  danger: "bg-danger-soft text-danger",
};

/**
 * Insights are derived server-side from real rows. When nothing qualifies the
 * panel says so, rather than being padded with filler to look busy.
 */
export function InsightsPanel({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) {
    return (
      <EmptyState
        compact
        icon={Lightbulb}
        title="No insights yet"
        body="Observations appear here once there's enough activity to draw them from."
      />
    );
  }

  return (
    <ul className="divide-y divide-line">
      {insights.map((insight) => (
        <li key={insight.kind}>
          <Link
            href={insight.href}
            className="flex items-center gap-3 px-5 py-3 hover:bg-raised transition-colors"
          >
            <span className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0", TONES[insight.tone])}>
              <Lightbulb className="w-3.5 h-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-hi truncate">{insight.title}</p>
              <p className="text-xs text-muted truncate">{insight.subtitle}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-faint shrink-0" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
