import {
  Briefcase,
  Building2,
  ExternalLink,
  Globe,
  Newspaper,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Source, SourceKind } from "@/lib/types";

// lucide dropped brand marks in v1, so LinkedIn gets a generic people icon
// rather than an approximation of someone's logo.
const ICONS: Record<SourceKind, LucideIcon> = {
  website: Globe,
  news: Newspaper,
  linkedin: Users,
  jobs: Briefcase,
  crunchbase: Building2,
  web: Globe,
};

const LABELS: Record<SourceKind, string> = {
  website: "Website",
  news: "News",
  linkedin: "LinkedIn",
  jobs: "Jobs",
  crunchbase: "Crunchbase",
  web: "Web",
};

/** A citation the reader can actually follow and check. */
export function SourceChip({ source, className }: { source: Source; className?: string }) {
  const Icon = ICONS[source.kind] ?? Globe;
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      title={source.title || source.url}
      className={cn(
        "group inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg",
        "bg-raised border border-line text-xs text-body",
        "hover:border-line-strong hover:text-hi transition-colors max-w-full",
        className
      )}
    >
      <Icon className="w-3.5 h-3.5 text-muted shrink-0" />
      <span className="truncate">{LABELS[source.kind] ?? "Web"}</span>
      <span className="text-faint truncate hidden sm:inline">· {source.hostname}</span>
      <ExternalLink className="w-3 h-3 text-faint opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </a>
  );
}
