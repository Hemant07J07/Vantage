import Image from "next/image";
import { cn } from "@/lib/cn";

/**
 * The Vantage mark. Rendered everywhere the brand appears — sidebar, mobile
 * nav, public header, login — so this is the one place the logo is defined.
 *
 * The glyph is the supplied brand asset (`public/vantage-mark.png`, extracted
 * from the master splash artwork with an alpha channel so it composites
 * cleanly onto the app's dark surfaces). The "VANTAGE / AI Growth Engine"
 * lockup stays live HTML rather than being baked into the image: it keeps the
 * text selectable and crisp at every size, and it lets the tagline be dropped
 * in tight slots via the `tagline` prop.
 */
export function Wordmark({
  tagline = true,
  className,
  size = 28,
}: {
  tagline?: boolean;
  className?: string;
  size?: number;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <Image
        src="/vantage-mark.png"
        alt="Vantage"
        width={size}
        height={Math.round((size * 248) / 256)}
        priority
        // Already exported at the right size; skipping the optimizer keeps the
        // standalone container free of a native sharp dependency for a 42KB
        // static asset that gains nothing from being re-encoded per request.
        unoptimized
        className="shrink-0"
      />
      <span className="min-w-0">
        <span className="block font-display font-semibold text-hi leading-tight tracking-tight">
          VANTAGE
        </span>
        {tagline && (
          <span className="block text-[10px] text-muted leading-tight">
            AI Growth Engine
          </span>
        )}
      </span>
    </div>
  );
}
