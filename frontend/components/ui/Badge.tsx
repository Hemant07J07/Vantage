import { cn } from "@/lib/cn";

export type BadgeTone =
  | "ok"
  | "warn"
  | "info"
  | "danger"
  | "neutral"
  | "accent"
  | "cyan";

/** Soft-tinted chip. The default, used for status in tables and detail views. */
const TONES: Record<BadgeTone, string> = {
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  info: "bg-info-soft text-info",
  danger: "bg-danger-soft text-danger",
  neutral: "bg-neutral-soft text-muted",
  accent: "bg-accent-soft text-accent",
  cyan: "bg-cyan-soft text-cyan",
};

/**
 * Outlined mono pill. Used for taxonomy labels — signal kinds, source kinds,
 * CITED/INFERRED — where the label is a category rather than a status, and
 * wants to read as machine output.
 */
const PILL_TONES: Record<BadgeTone, string> = {
  ok: "border-ok/25 bg-ok/10 text-ok",
  warn: "border-warn/25 bg-warn/10 text-warn",
  info: "border-info/25 bg-info/10 text-info",
  danger: "border-danger/25 bg-danger/10 text-danger",
  neutral: "border-white/12 bg-white/5 text-muted",
  accent: "border-accent/30 bg-accent/10 text-accent",
  cyan: "border-cyan/30 bg-cyan/10 text-cyan",
};

const DOTS: Record<BadgeTone, string> = {
  ok: "bg-ok",
  warn: "bg-warn",
  info: "bg-info",
  danger: "bg-danger",
  neutral: "bg-muted",
  accent: "bg-accent",
  cyan: "bg-cyan",
};

export function Badge({
  tone = "neutral",
  variant = "chip",
  dot = false,
  title,
  className,
  children,
}: {
  tone?: BadgeTone;
  variant?: "chip" | "pill";
  dot?: boolean;
  title?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const pill = variant === "pill";

  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap",
        pill
          ? [
              "rounded-lg border px-2 py-1",
              "font-mono text-[10px] uppercase tracking-[0.08em]",
              PILL_TONES[tone],
            ]
          : [
              "rounded-pill px-2 py-0.5 text-xs font-medium",
              TONES[tone],
            ],
        className
      )}
    >
      {dot && (
        <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", DOTS[tone])} />
      )}
      {children}
    </span>
  );
}
