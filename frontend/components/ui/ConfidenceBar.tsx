import { cn } from "@/lib/cn";

/**
 * Confidence 0-1 for a single claim.
 *
 * Unsourced claims are drawn in muted grey rather than the accent colour, so
 * "the model inferred this" never looks as solid as "a page says this".
 */
export function ConfidenceBar({
  confidence,
  unsourced = false,
  className,
}: {
  confidence: number;
  unsourced?: boolean;
  className?: string;
}) {
  const pct = Math.round(Math.min(Math.max(confidence, 0), 1) * 100);
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-1 w-14 rounded-full bg-line overflow-hidden">
        <div
          className={cn("h-full rounded-full", unsourced ? "bg-muted" : "bg-accent")}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[11px] font-mono tabular text-muted">{pct}%</span>
    </div>
  );
}
