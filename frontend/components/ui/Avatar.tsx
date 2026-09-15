import { cn } from "@/lib/cn";
import { initialsOf } from "@/lib/format";

/**
 * Company avatar. Initials on a deterministic tint are the DEFAULT, not a
 * fallback — there are no logo assets in this product, so a broken-image
 * placeholder would be the common case rather than the exception.
 */
const TINTS = [
  "bg-accent-soft text-accent",
  "bg-info-soft text-info",
  "bg-ok-soft text-ok",
  "bg-warn-soft text-warn",
  "bg-danger-soft text-danger",
];

function tintFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return TINTS[hash % TINTS.length];
}

export function Avatar({
  name,
  size = 32,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-semibold shrink-0",
        tintFor(name),
        className
      )}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      aria-hidden
    >
      {initialsOf(name)}
    </span>
  );
}
