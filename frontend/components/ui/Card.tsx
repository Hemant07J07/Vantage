import { cn } from "@/lib/cn";

export type CardVariant = "glass" | "solid" | "gradient";

const VARIANTS: Record<CardVariant, string> = {
  // Default. Translucent, so the page's background glow reads through.
  glass: "glass-card shadow-glass",

  // Opaque. For dense scrolling tables, where a backdrop-filter on a tall
  // element repaints on every scroll frame and costs far more than it adds.
  solid: "bg-surface border border-line rounded-card shadow-card",

  // The computed-summary strip: a violet-to-cyan wash with a travelling
  // hairline across the top edge.
  gradient:
    "sweep-line rounded-card border border-accent/25 shadow-glass " +
    "bg-gradient-to-br from-accent/[0.16] via-cyan/[0.07] to-white/[0.02]",
};

/**
 * The card recipe, which previously appeared inline about ten times across
 * four files and had already drifted between them.
 */
export function Card({
  variant = "glass",
  interactive = false,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  variant?: CardVariant;
  interactive?: boolean;
}) {
  return (
    <div
      className={cn(
        VARIANTS[variant],
        interactive &&
          "transition-colors hover:border-accent/35 hover:bg-glass-hover",
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 px-5 py-4 border-b border-line",
        className
      )}
      {...props}
    />
  );
}

export function CardTitle({
  mono = false,
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement> & { mono?: boolean }) {
  return (
    <h3
      className={cn(
        // `mono` is opt-in: turning every title into an uppercase mono caption
        // at once would make the whole app shout.
        mono ? "label-mono text-muted" : "font-display text-[15px] font-semibold text-hi",
        className
      )}
      {...props}
    />
  );
}

export function CardSubtitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-xs text-muted", className)} {...props} />;
}

export function CardBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...props} />;
}
