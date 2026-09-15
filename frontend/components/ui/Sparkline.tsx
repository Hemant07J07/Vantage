import { cn } from "@/lib/cn";
import type { SeriesPoint } from "@/lib/types";

/**
 * Tiny trend line for the metric cards.
 *
 * `hasEnoughHistory` is a REQUIRED prop with no default, deliberately: it
 * forces every call site to state whether the data actually supports drawing a
 * trend. When it's false we render a flat dashed baseline and say so, rather
 * than joining two points into a line that implies a direction nobody measured.
 */
export function Sparkline({
  points,
  hasEnoughHistory,
  tone = "accent",
  className,
}: {
  points: SeriesPoint[];
  hasEnoughHistory: boolean;
  tone?: "accent" | "ok" | "warn" | "danger";
  className?: string;
}) {
  const width = 96;
  const height = 28;

  if (!hasEnoughHistory) {
    return (
      <div className={cn("flex items-center", className)} title="Not enough history yet">
        <svg width={width} height={height} aria-hidden>
          <line
            x1={0}
            y1={height / 2}
            x2={width}
            y2={height / 2}
            className="stroke-line"
            strokeWidth={1.5}
            strokeDasharray="3 4"
          />
        </svg>
      </div>
    );
  }

  const values = points.map((p) => p.value);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;

  const step = points.length > 1 ? width / (points.length - 1) : width;
  const path = points
    .map((point, index) => {
      const x = index * step;
      const y = height - ((point.value - min) / span) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const strokes = {
    accent: "stroke-accent",
    ok: "stroke-ok",
    warn: "stroke-warn",
    danger: "stroke-danger",
  } as const;

  return (
    <svg width={width} height={height} className={className} aria-hidden>
      <path d={path} fill="none" strokeWidth={1.5} className={strokes[tone]} strokeLinejoin="round" />
    </svg>
  );
}
