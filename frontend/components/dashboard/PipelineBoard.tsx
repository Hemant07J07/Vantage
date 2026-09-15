"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar, Badge, GaugeRing } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatRelative } from "@/lib/format";
import type { BadgeTone } from "@/components/ui";
import type { StageMeta } from "@/lib/meta";
import type { CompanyListItem, PipelineStage } from "@/lib/types";

/**
 * Colour per stage. Presentation only — which stages *exist*, what they mean
 * and which accept a drop all come from the backend, because those are rules
 * the pipeline enforces rather than decisions the board gets to make.
 */
const STAGE_TONES: Record<string, BadgeTone> = {
  new: "neutral",
  researching: "info",
  qualified: "accent",
  engaged: "cyan",
  won: "ok",
};

/**
 * The pipeline board.
 *
 * Only stages the backend reports as `manual` accept a drop. The rest are
 * computed from research — letting the board write them would put it in
 * disagreement with the pipeline the next time a job ran, and would let the
 * UI assert an account was "qualified" when its score says otherwise.
 *
 * Engaged and Won are the opposite case: nothing here observes a reply or a
 * closed deal, so a person declaring it is the only evidence that exists.
 */
export function PipelineBoard({
  accounts,
  stages,
}: {
  accounts: CompanyListItem[];
  stages: StageMeta[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dragId, setDragId] = useState<number | null>(null);
  const [overKey, setOverKey] = useState<PipelineStage | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function move(companyId: number, stage: PipelineStage | "reset") {
    setError(null);
    const res = await fetch(`/api/companies/${companyId}/stage`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage }),
    });

    if (!res.ok) {
      setError("Couldn't move that account. It may need research first.");
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div
        style={{
          gridTemplateColumns: `repeat(${stages.length}, minmax(230px, 1fr))`,
        }}
        className={cn(
          "grid gap-3.5 overflow-x-auto pb-2",
          pending && "opacity-60 transition-opacity"
        )}
      >
        {stages.map((column) => {
          const cards = accounts.filter(
            (a) => (a.intelligence?.stage ?? "new") === column.key
          );
          const tone = STAGE_TONES[column.key] ?? "neutral";
          const isTarget = column.manual && dragId !== null;

          return (
            <section
              key={column.key}
              onDragOver={(e) => {
                if (!column.manual) return;
                e.preventDefault();
                setOverKey(column.key);
              }}
              onDragLeave={() => setOverKey(null)}
              onDrop={(e) => {
                e.preventDefault();
                setOverKey(null);
                if (column.manual && dragId !== null) move(dragId, column.key);
                setDragId(null);
              }}
              className={cn(
                "rounded-card border p-3.5 min-w-0 transition-colors",
                overKey === column.key
                  ? "border-accent/50 bg-accent/[0.06]"
                  : isTarget
                    ? "border-dashed border-accent/25 bg-white/[0.02]"
                    : "border-line bg-white/[0.02]"
              )}
            >
              <header className="mb-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="label-mono">{column.label}</span>
                  <span className="font-mono text-[11px] tabular text-faint">
                    {cards.length}
                  </span>
                </div>
                <p className="mt-1 font-mono text-[10px] text-faint truncate">
                  {column.description}
                </p>
                <div
                  className={cn(
                    "mt-2.5 h-0.5 rounded-full",
                    column.manual
                      ? "bg-gradient-to-r from-accent to-cyan opacity-60"
                      : "bg-line-strong"
                  )}
                />
              </header>

              {cards.length === 0 ? (
                <p className="px-1 py-6 text-center font-mono text-[11px] text-faint">
                  {column.manual ? "Drag an account here" : "Empty"}
                </p>
              ) : (
                <ul className="space-y-2.5">
                  {cards.map((account) => (
                    <li key={account.id}>
                      <div
                        draggable
                        onDragStart={() => setDragId(account.id)}
                        onDragEnd={() => {
                          setDragId(null);
                          setOverKey(null);
                        }}
                        className={cn(
                          "rounded-xl border border-line bg-white/[0.035] p-3 cursor-grab active:cursor-grabbing",
                          "transition-colors hover:border-accent/35",
                          dragId === account.id && "opacity-50"
                        )}
                      >
                        <div className="flex items-start gap-2.5">
                          <Avatar name={account.name} size={26} />
                          <Link
                            href={`/dashboard/accounts/${account.id}`}
                            className="min-w-0 flex-1 text-[13px] font-medium leading-snug text-hi hover:text-accent transition-colors"
                          >
                            {account.name}
                          </Link>
                          <GaugeRing
                            value={account.intelligence?.icp_fit_score ?? null}
                            size={28}
                          />
                        </div>

                        <div className="mt-2.5 flex items-center justify-between gap-2">
                          <Badge tone={tone} variant="pill">
                            {account.intelligence?.buying_intent ?? "unknown"}
                          </Badge>
                          <span className="font-mono text-[10px] text-faint">
                            {formatRelative(account.intelligence?.computed_at)}
                          </span>
                        </div>

                        {column.manual && (
                          <button
                            type="button"
                            onClick={() => move(account.id, "reset")}
                            className="mt-2 font-mono text-[10px] text-faint hover:text-muted transition-colors"
                          >
                            ← return to pipeline
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
