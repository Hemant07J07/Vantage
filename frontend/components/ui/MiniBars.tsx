import { cn } from "@/lib/cn";
import type { SeriesPoint } from "@/lib/types";

const BAR_COUNT = 9;

const ACCENTS: Record<string, string> = {
  accent: "bg-accent",
  ok: "bg-ok",
  warn: "bg-warn",
  danger: "bg-danger",
  cyan: "bg-cyan",
};

/**
 * The nine-bar micro histogram beside a KPI value.
 *
 * Carries the same honesty rule as `Sparkline`: when there isn't enough
 * history to imply a trend, this renders nine flat baselines rather than
 * nine bars of whatever noise happens to be in the series. Bars of differing
 * heights read as a trend whether or not one exists, so drawing them from a
 * two-point series would be a fabrication dressed up as decoration.
 */
export function MiniBars({
  points,
  hasEnoughHistory,
  tone = "accent",
  className,
}: {
  points: SeriesPoint[];
  hasEnoughHistory: boolean;
  tone?: keyof typeof ACCENTS;
  className?: string;
}) {
  if (!hasEnoughHistory || points.length === 0) {
    return (
      <div
        className={cn("flex items-end gap-[3px] h-9", className)}
        aria-hidden="true"
      >
        {Array.from({ length: BAR_COUNT }).map((_, i) => (
          <span key={i} className="w-1 h-0.5 rounded-full bg-white/[0.08]" />
        ))}
      </div>
    );
  }

  const recent = points.slice(-BAR_COUNT);
  const values = recent.map((p) => p.value);
  const max = Math.max(...values, 1);

  return (
    <div
      className={cn("flex items-end gap-[3px] h-9", className)}
      aria-hidden="true"
    >
      {recent.map((point, i) => {
        const last = i === recent.length - 1;
        // Floored at 8% so a zero-value day is still a visible tick rather
        // than a gap the eye reads as missing data.
        const height = Math.max(8, (point.value / max) * 100);

        return (
          <span
            key={point.date}
            style={{ height: `${height}%` }}
            className={cn(
              "w-1 rounded-full origin-bottom animate-bar-rise",
              last ? ACCENTS[tone] ?? ACCENTS.accent : "bg-white/[0.14]"
            )}
          />
        );
      })}
    </div>
  );
}
