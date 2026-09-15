import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";

/**
 * Usage meter for the sidebar rail.
 *
 * When no limit is configured the bar is omitted entirely and only the real
 * count is shown — inventing a denominator to make a progress bar look
 * complete would be fabricating a quota that doesn't exist.
 */
export function ProgressMeter({
  label,
  value,
  limit,
  className,
}: {
  label: string;
  value: number;
  limit: number | null;
  className?: string;
}) {
  const pct = limit ? Math.min(100, Math.round((value / limit) * 100)) : null;

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] text-muted">{label}</span>
        <span className="text-[11px] font-mono tabular text-body">
          {formatNumber(value)}
          {limit != null && <span className="text-faint"> / {formatNumber(limit)}</span>}
        </span>
      </div>
      {pct != null && (
        <div className="h-1 rounded-full bg-line overflow-hidden">
          <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}
