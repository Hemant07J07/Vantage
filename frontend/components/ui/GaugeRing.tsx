import { cn } from "@/lib/cn";
import { SCORE_HIGH, SCORE_MEDIUM } from "@/lib/constants";

/**
 * Circular percentage gauge, hand-rolled SVG rather than Recharts — it's one
 * arc, and pulling a chart library in for it would cost more than it saves.
 *
 * A null value means "not measured" and renders a dashed track with an em
 * dash, distinct from a measured zero.
 */
export function GaugeRing({
  value,
  size = 44,
  strokeWidth = 4,
  label,
  className,
}: {
  value: number | null;
  size?: number;
  strokeWidth?: number;
  label?: string;
  className?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const measured = value != null;
  const pct = measured ? Math.min(Math.max(value, 0), 100) : 0;
  const dash = (pct / 100) * circumference;

  const color =
    !measured ? "stroke-faint"
      : pct >= SCORE_HIGH ? "stroke-ok"
      : pct >= SCORE_MEDIUM ? "stroke-accent"
      : "stroke-warn";

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-line"
          strokeDasharray={measured ? undefined : "3 4"}
        />
        {measured && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            className={color}
            strokeDasharray={`${dash} ${circumference - dash}`}
          />
        )}
      </svg>
      <span
        className="absolute font-mono tabular font-medium text-hi"
        style={{ fontSize: size * 0.28 }}
      >
        {measured ? pct : "—"}
      </span>
      {label && <span className="sr-only">{label}</span>}
    </div>
  );
}
