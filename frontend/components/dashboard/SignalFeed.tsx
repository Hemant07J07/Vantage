"use client";

import { useState } from "react";
import Link from "next/link";
import { Radio } from "lucide-react";
import { Badge, EmptyState, ToneDot } from "@/components/ui";
import { useSearch } from "@/components/providers/SearchProvider";
import { EvidenceDrawer } from "./EvidenceDrawer";
import { formatRelative } from "@/lib/format";
import type { BadgeTone } from "@/components/ui";
import type { FeedSignal, SignalType } from "@/lib/types";

/**
 * Tone per signal kind. Presentation only — the human-readable label comes
 * from the backend (`type_label`), which reads it off `Signal.Type`, so the
 * vocabulary exists in one place.
 *
 * `web` is deliberately neutral: site activity is the weakest kind of
 * evidence here and shouldn't carry the visual weight of a funding round.
 */
const SIGNAL_TONES: Record<SignalType, BadgeTone> = {
  funding: "accent",
  hiring: "cyan",
  product: "warn",
  leadership: "info",
  news: "ok",
  web: "neutral",
};

export function SignalFeed({
  signals,
  unsourcedConfidenceCap,
}: {
  signals: FeedSignal[];
  /** 0-1 ceiling the backend applies to uncited claims. */
  unsourcedConfidenceCap: number;
}) {
  const [openId, setOpenId] = useState<number | null>(null);
  const { query } = useSearch();

  // Small, already-fetched list (this feed is capped by the backend), so
  // filtering it in place is honest — there's no page 2 hiding a match.
  const visible = query
    ? signals.filter(
        (s) =>
          s.company_name.toLowerCase().includes(query.toLowerCase()) ||
          s.value.toLowerCase().includes(query.toLowerCase())
      )
    : signals;

  const active = visible.find((s) => s.id === openId) ?? null;

  if (signals.length === 0) {
    return (
      <EmptyState
        icon={Radio}
        title="No signals yet"
        body="Research an account and Vantage starts watching it for funding rounds, hiring pushes, launches and leadership changes."
      />
    );
  }

  if (visible.length === 0) {
    // Distinct from the empty-list state above: there IS data, none of it
    // matched. Conflating the two would read as "nothing has ever happened"
    // when the truth is "nothing here mentions that".
    return (
      <EmptyState
        icon={Radio}
        title="No signals match your search"
        body={`Nothing here mentions "${query}".`}
      />
    );
  }

  return (
    <>
      <ul>
        {visible.map((signal) => {
          const tone = SIGNAL_TONES[signal.type] ?? "neutral";
          // The backend decides what counts as cited, the same way it
          // does for research claims.
          const cited = !signal.unsourced;

          return (
            <li
              key={signal.id}
              className="flex gap-3.5 px-5 py-4 border-t border-line transition-colors hover:bg-white/[0.02]"
            >
              <ToneDot tone={tone} className="mt-1.5" />

              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/dashboard/accounts/${signal.company_id}`}
                    className="font-display text-[15px] font-semibold text-hi hover:text-accent transition-colors truncate"
                  >
                    {signal.company_name}
                  </Link>
                  <Badge tone={tone} variant="pill">
                    {signal.type_label}
                  </Badge>
                  <span
                    className="ml-auto font-mono text-[11px] text-faint shrink-0"
                    title={
                      signal.detected_at
                        ? "When the event happened"
                        : "When Vantage observed this — the event's own date wasn't available"
                    }
                  >
                    {signal.detected_at
                      ? formatRelative(signal.detected_at)
                      : `seen ${formatRelative(signal.observed_at)}`}
                  </span>
                </div>

                <p className="mt-1.5 text-sm leading-relaxed text-body text-pretty">
                  {signal.value}
                </p>

                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  {cited ? (
                    <button
                      type="button"
                      onClick={() => setOpenId(signal.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-accent/25 bg-accent/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-accent transition-colors hover:bg-accent/20"
                    >
                      ◆ {signal.sources.length}{" "}
                      {signal.sources.length === 1 ? "source" : "sources"}
                    </button>
                  ) : (
                    // Never hidden. A signal with nothing behind it is still
                    // shown, labelled for what it is.
                    <Badge
                      tone="warn"
                      variant="pill"
                      title="No page was attached to this signal"
                    >
                      Uncited
                    </Badge>
                  )}
                  <Badge tone="neutral" variant="pill">
                    {signal.strength_label} strength
                  </Badge>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <EvidenceDrawer
        open={active !== null}
        onClose={() => setOpenId(null)}
        heading={active?.company_name ?? ""}
        claim={active?.value ?? ""}
        sources={active?.sources ?? []}
        unsourced={active?.unsourced}
        unsourcedConfidenceCap={unsourcedConfidenceCap}
      />
    </>
  );
}
