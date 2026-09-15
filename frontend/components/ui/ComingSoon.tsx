import type { LucideIcon } from "lucide-react";
import { Badge } from "./Badge";
import { Card } from "./Card";

/**
 * A planned-but-unbuilt section.
 *
 * These exist as real pages so the navigation is honest: a link that leads to
 * a clear "not built yet, here's what it will do" reads as deliberate, whereas
 * a dead link reads as broken and a hidden one hides the roadmap.
 */
export function ComingSoon({
  icon: Icon,
  title,
  description,
  bullets = [],
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  bullets?: string[];
}) {
  return (
    <Card className="p-8 md:p-12">
      <div className="max-w-lg mx-auto text-center">
        <div className="w-12 h-12 rounded-xl bg-raised border border-line flex items-center justify-center mx-auto mb-4">
          <Icon className="w-5 h-5 text-accent" />
        </div>
        <div className="flex items-center justify-center gap-2 mb-2">
          <h2 className="text-lg font-semibold text-hi">{title}</h2>
          <Badge tone="accent">Planned</Badge>
        </div>
        <p className="text-sm text-muted">{description}</p>
        {bullets.length > 0 && (
          <ul className="mt-6 space-y-2 text-left inline-block">
            {bullets.map((item) => (
              <li key={item} className="flex gap-2.5 text-sm text-body">
                <span className="mt-1.5 w-1 h-1 rounded-full bg-accent shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
