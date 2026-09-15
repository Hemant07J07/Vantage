import { cn } from "@/lib/cn";
import type { BadgeTone } from "./Badge";

const TONES: Record<BadgeTone, string> = {
  ok: "bg-ok shadow-[0_0_10px_2px_rgba(52,211,153,0.45)]",
  warn: "bg-warn shadow-[0_0_10px_2px_rgba(251,191,36,0.45)]",
  info: "bg-info shadow-[0_0_10px_2px_rgba(56,189,248,0.45)]",
  danger: "bg-danger shadow-[0_0_10px_2px_rgba(248,113,113,0.45)]",
  neutral: "bg-muted",
  accent: "bg-accent shadow-[0_0_10px_2px_rgba(124,92,255,0.5)]",
  cyan: "bg-cyan shadow-[0_0_10px_2px_rgba(41,211,238,0.45)]",
};

/**
 * The glowing status dot used down the left edge of feed rows.
 *
 * Decoration only — it always sits beside text that carries the same meaning,
 * so it never becomes the sole channel for information.
 */
export function ToneDot({
  tone = "neutral",
  pulse = false,
  className,
}: {
  tone?: BadgeTone;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "w-2 h-2 rounded-full shrink-0",
        TONES[tone],
        pulse && "animate-pulse-dot",
        className
      )}
    />
  );
}
