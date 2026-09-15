import { EmptyState } from "@/components/ui";
import { PieChart } from "lucide-react";
import type { TopIndustries } from "@/lib/types";

/**
 * Industry mix.
 *
 * With a single industry present, a 100%-wide bar is a tautology rather than
 * an insight — so below two industries the bars are dropped and the raw counts
 * shown instead, with the sample size stated.
 */
export function TopIndustriesList({ data }: { data: TopIndustries }) {
  if (data.results.length === 0) {
    return (
      <EmptyState
        compact
        icon={PieChart}
        title="No industry data"
        body="Industries appear once leads arrive with company details."
      />
    );
  }

  return (
    <div className="space-y-3">
      {data.results.map((row) => (
        <div key={row.industry}>
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <span className="text-sm text-body truncate">{row.industry}</span>
            <span className="text-xs font-mono tabular text-muted shrink-0">
              {data.show_shares ? `${row.share_pct}%` : `${row.count}`}
            </span>
          </div>
          {data.show_shares && (
            <div className="h-1.5 rounded-full bg-line overflow-hidden">
              <div className="h-full rounded-full bg-accent" style={{ width: `${row.share_pct}%` }} />
            </div>
          )}
        </div>
      ))}
      <p className="text-[11px] text-faint pt-1">
        Based on {data.total_leads} lead{data.total_leads === 1 ? "" : "s"}
      </p>
    </div>
  );
}
