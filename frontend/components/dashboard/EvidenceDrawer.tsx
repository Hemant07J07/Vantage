"use client";

import { ExternalLink } from "lucide-react";
import { Badge, ConfidenceBar, SlideOver } from "@/components/ui";
import { formatRelative } from "@/lib/format";
import type { Source, SourceKind } from "@/lib/types";

const KIND_LABELS: Record<SourceKind, string> = {
  website: "Website",
  news: "News",
  linkedin: "LinkedIn",
  jobs: "Jobs",
  crunchbase: "Crunchbase",
  web: "Web",
};

/**
 * The pages behind one claim or signal.
 *
 * Three honesty rules are enforced here rather than left to call sites:
 *
 *  1. CITED vs INFERRED comes from the backend's `unsourced` flag, not from a
 *     guess at the confidence number. A claim nothing backed up is labelled as
 *     the model's inference and says so in plain words.
 *  2. `Source` has no publisher and no publication date — only `fetched_at`,
 *     which is when *we* retrieved the page. It is labelled "Fetched", never
 *     "Published", and the footer says so, because presenting a retrieval
 *     timestamp as a publication date would misdate every piece of evidence.
 *  3. An empty source list renders an explicit statement, not a blank panel.
 */
export function EvidenceDrawer({
  open,
  onClose,
  heading,
  claim,
  sources,
  confidence,
  unsourced,
  unsourcedConfidenceCap,
}: {
  open: boolean;
  onClose: () => void;
  /** The company or context the claim belongs to. */
  heading: string;
  /** The assertion the sources are evidence for. */
  claim: string;
  sources: Source[];
  /** 0–1, when the backend computed one. */
  confidence?: number | null;
  unsourced?: boolean;
  /** 0-1 ceiling the backend applies to uncited claims. */
  unsourcedConfidenceCap: number;
}) {
  const capPct = Math.round(unsourcedConfidenceCap * 100);
  // Derived from the flag when given, otherwise from whether anything backs
  // the claim up at all — never from the confidence score alone.
  const inferred = unsourced ?? sources.length === 0;

  return (
    <SlideOver open={open} onClose={onClose} title="Evidence" className="max-w-xl">
      <div className="p-5 space-y-5">
        <div>
          <p className="label-mono">{heading}</p>
          <p className="mt-2.5 font-display text-lg leading-snug text-hi text-pretty">
            {claim}
          </p>

          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            {inferred ? (
              <Badge
                tone="warn"
                variant="pill"
                title={`Model inference, confidence capped at ${capPct}%`}
              >
                Inferred
              </Badge>
            ) : (
              <Badge tone="ok" variant="pill">
                Cited
              </Badge>
            )}
            <Badge tone="neutral" variant="pill">
              {sources.length} {sources.length === 1 ? "source" : "sources"}
            </Badge>
          </div>

          {confidence != null && (
            <div className="mt-4">
              <ConfidenceBar confidence={confidence} unsourced={inferred} />
            </div>
          )}

          {inferred && (
            <p className="mt-3 text-xs leading-relaxed text-muted">
              Nothing retrieved backs this up directly — the model inferred it
              from context. Confidence is capped at {capPct}% for uncited
              claims.
            </p>
          )}
        </div>

        <div className="h-px bg-line" />

        {sources.length === 0 ? (
          <p className="text-sm text-muted">
            No sources were attached to this claim.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {sources.map((source) => (
              <li key={source.id}>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block rounded-xl border border-line bg-white/[0.035] p-4 transition-colors hover:border-accent/35 hover:bg-glass-hover"
                >
                  <div className="flex items-center gap-2">
                    <Badge tone="accent" variant="pill">
                      {KIND_LABELS[source.kind] ?? "Web"}
                    </Badge>
                    <span
                      className="ml-auto font-mono text-[10px] text-faint"
                      title="When Vantage retrieved this page"
                    >
                      Fetched {formatRelative(source.fetched_at)}
                    </span>
                  </div>

                  <p className="mt-2.5 text-sm font-medium leading-snug text-hi">
                    {source.title || source.url}
                  </p>

                  {source.snippet && (
                    <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted">
                      {source.snippet}
                    </p>
                  )}

                  <div className="mt-2.5 flex items-center gap-1.5">
                    <span className="font-mono text-[11px] text-faint truncate">
                      {source.hostname}
                    </span>
                    <ExternalLink className="w-3 h-3 text-faint opacity-0 transition-opacity group-hover:opacity-100 shrink-0" />
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )}

        <p className="text-[11px] leading-relaxed text-faint">
          Dates shown are when Vantage retrieved the page, not when it was
          published. Research uses publicly available information and a locally
          hosted model; results are an automated analysis, not a statement of
          fact about any company.
        </p>
      </div>
    </SlideOver>
  );
}
