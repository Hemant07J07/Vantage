import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card } from "@/components/ui";
import { formatNumber } from "@/lib/format";
import type { DashboardSummary } from "@/lib/types";

/**
 * The period summary at the top of the overview.
 *
 * Every number here is counted from the same payload the KPI row uses, and the
 * sentence is assembled in this file — it is **not** model output. The label
 * says "Computed from your data" for that reason: nothing in the backend
 * generates a narrative, and dressing a template up as an AI summary would
 * misattribute it.
 *
 * When the period is empty it says so rather than rendering a sentence full
 * of zeroes, which reads as a broken panel rather than an honest one.
 */
export function SummaryStrip({
  summary,
  rangeDays,
  researchedCount,
  signalCount,
}: {
  summary: DashboardSummary;
  rangeDays: number;
  researchedCount: number;
  signalCount: number;
}) {
  const leads = summary.total_leads.period_value;
  const qualified = summary.qualified_leads.period_value;
  const highIntent = summary.high_intent.value;
  const pending = summary.actions_pending.value;

  const empty = leads === 0 && researchedCount === 0;

  return (
    <Card variant="gradient" className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div className="min-w-[280px] flex-1">
          <div className="flex items-center gap-2.5">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-dot shadow-[0_0_10px_2px_rgba(124,92,255,0.5)]" />
            <span className="label-mono text-accent">
              Computed from your data · last {rangeDays} days
            </span>
          </div>

          {empty ? (
            <p className="mt-3.5 font-display text-lg leading-relaxed text-body text-pretty">
              Nothing to summarise yet. Research an account or capture a lead,
              and this strip reports what actually changed.
            </p>
          ) : (
            <p className="mt-3.5 font-display text-[19px] leading-relaxed text-hi text-pretty max-w-3xl">
              {formatNumber(leads)} {leads === 1 ? "lead" : "leads"} captured,{" "}
              <strong className="font-semibold">
                {formatNumber(qualified)} qualified
              </strong>
              . {formatNumber(researchedCount)}{" "}
              {researchedCount === 1 ? "account" : "accounts"} researched
              {signalCount > 0 && (
                <>
                  {" "}
                  and{" "}
                  <strong className="font-semibold">
                    {formatNumber(signalCount)} buying{" "}
                    {signalCount === 1 ? "signal" : "signals"}
                  </strong>{" "}
                  picked up
                </>
              )}
              .{" "}
              {highIntent > 0
                ? `${formatNumber(highIntent)} now reading as high intent.`
                : "None are reading as high intent yet."}
            </p>
          )}

          {pending > 0 && (
            <p className="mt-2.5 font-mono text-xs text-muted">
              {formatNumber(pending)} {pending === 1 ? "lead is" : "leads are"}{" "}
              waiting on a next step.
            </p>
          )}
        </div>

        <Link
          href="/dashboard/research"
          className="inline-flex items-center gap-2.5 rounded-xl bg-accent px-5 py-3.5 font-display text-sm font-semibold text-white shadow-[0_10px_30px_-8px_rgba(124,92,255,0.6)] transition-colors hover:bg-accent-hover"
        >
          Run new research
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </Card>
  );
}
