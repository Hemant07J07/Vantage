import Link from "next/link";
import { cn } from "@/lib/cn";

const BASE =
  "inline-flex items-center gap-1.5 px-3.5 py-2 rounded-pill text-[13px] " +
  "font-medium transition-colors whitespace-nowrap border";

const ACTIVE = "bg-accent/[0.18] border-accent/40 text-hi";
const IDLE = "bg-white/[0.035] border-line text-muted hover:text-hi hover:bg-glass-hover";

/**
 * The pill used for range and status filters.
 *
 * Renders as a link when `href` is given so filter state stays in the URL
 * (shareable, survives reload, works without JS), and as a button otherwise
 * for purely client-side filtering.
 */
export function FilterPill({
  active = false,
  href,
  count,
  onClick,
  className,
  children,
}: {
  active?: boolean;
  href?: string;
  count?: number;
  onClick?: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  const content = (
    <>
      {children}
      {count != null && (
        <span
          className={cn(
            "font-mono text-[11px] tabular",
            active ? "text-hi/70" : "text-faint"
          )}
        >
          {count}
        </span>
      )}
    </>
  );

  const classes = cn(BASE, active ? ACTIVE : IDLE, className);

  if (href) {
    return (
      <Link href={href} aria-current={active ? "page" : undefined} className={classes}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={classes}>
      {content}
    </button>
  );
}
