import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * The honest-empty pattern used throughout.
 *
 * Sparse data is the normal state of this product on first run, so an empty
 * panel should explain what will fill it rather than looking broken or, worse,
 * being padded with invented rows.
 */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  className,
  compact = false,
}: {
  icon?: LucideIcon;
  title: string;
  body?: string;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "py-8 px-4" : "py-14 px-6",
        className
      )}
    >
      {Icon && (
        <div className="w-10 h-10 rounded-full bg-raised border border-line flex items-center justify-center mb-3">
          <Icon className="w-4 h-4 text-muted" />
        </div>
      )}
      <p className="text-sm font-medium text-hi">{title}</p>
      {body && <p className="mt-1 text-xs text-muted max-w-xs">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
