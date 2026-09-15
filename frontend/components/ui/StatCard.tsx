import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card } from "./Card";
import { MiniBars } from "./MiniBars";
import { Sparkline } from "./Sparkline";
import { cn } from "@/lib/cn";
import { formatDelta, formatNumber } from "@/lib/format";
import { MIN_TREND_DAYS } from "@/lib/constants";
import type { MetricSeries } from "@/lib/types";

/**
 * A metric card.
 *
 * Two honesty rules are baked in rather than left to call sites:
 *   * a null delta renders "—" with an explanation, never "+0%", because no
 *     prior period means we couldn't measure change — not that there was none;
 *   * the sparkline degrades to a labelled baseline when the series is too
 *     short to imply a trend.
 */
export function StatCard({
  label,
  metric,
  tone = "accent",
  variant = "bars",
}: {
  label: string;
  metric: MetricSeries;
  tone?: "accent" | "ok" | "warn" | "danger" | "cyan";
  /** `bars` is the KPI-row treatment; `spark` keeps the original line. */
  variant?: "bars" | "spark";
}) {
  const { delta_pct: delta, has_enough_history: hasHistory } = metric;
  const positive = delta != null && delta > 0;
  const negative = delta != null && delta < 0;

  return (
    <Card className="p-5">
      <p className="label-mono">{label}</p>

      <div className="mt-3.5 flex items-end justify-between gap-3">
        <p className="font-mono tabular text-[34px] font-medium text-hi leading-none tracking-tight">
          {formatNumber(metric.value)}
        </p>
        {variant === "bars" ? (
          <MiniBars
            points={metric.series}
            hasEnoughHistory={hasHistory}
            tone={tone}
          />
        ) : (
          <Sparkline
            points={metric.series}
            hasEnoughHistory={hasHistory}
            tone={tone === "cyan" ? "accent" : tone}
          />
        )}
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-xs">
        {delta == null ? (
          <span
            className="font-mono text-[11px] text-faint"
            title="No prior period to compare against"
          >
            — no prior period
          </span>
        ) : (
          <>
            <span
              className={cn(
                "inline-flex items-center gap-0.5 font-mono text-[11px] font-medium",
                positive && "text-ok",
                negative && "text-danger",
                !positive && !negative && "text-muted"
              )}
            >
              {positive && <ArrowUpRight className="w-3 h-3" />}
              {negative && <ArrowDownRight className="w-3 h-3" />}
              {formatDelta(delta)}
            </span>
            <span className="font-mono text-[11px] text-faint">vs prior period</span>
          </>
        )}
      </div>

      {!hasHistory && (
        <p className="mt-1.5 font-mono text-[10px] text-faint">
          Trend appears after {MIN_TREND_DAYS} days of data
        </p>
      )}
    </Card>
  );
}
