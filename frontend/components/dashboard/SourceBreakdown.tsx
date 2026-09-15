import { Inbox } from "lucide-react";
import { EmptyState } from "@/components/ui";
import { SOURCE_LABELS } from "@/lib/constants";
import type { SourceBreakdownRow } from "@/lib/types";

/**
 * Where leads come from, and how they score once they arrive.
 *
 * Deliberately *not* labelled as conversion: nothing in this system captures
 * an outcome, so the only honest comparison between channels is volume and
 * average qualification score. A "source to close" rate would need data that
 * doesn't exist.
 */
export function SourceBreakdown({ rows }: { rows: SourceBreakdownRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="No leads yet"
        body="Channel performance appears once leads start arriving."
      />
    );
  }

  const max = Math.max(...rows.map((r) => r.count), 1);

  return (
    <ul className="space-y-4">
      {rows.map((row) => (
        <li key={row.source}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-body">
              {SOURCE_LABELS[row.source] ?? row.source}
            </span>
            <span className="font-mono tabular text-[13px] text-muted shrink-0">
              {row.count}
              {row.avg_score != null && (
                <span className="text-faint">
                  {" "}
                  · avg {Math.round(row.avg_score)}
                </span>
              )}
            </span>
          </div>

          <div className="mt-2 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-accent to-cyan"
              style={{ width: `${(row.count / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
