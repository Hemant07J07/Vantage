import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  FilterPill,
  GaugeRing,
} from "@/components/ui";
import { IntentOverTimeChart } from "@/components/dashboard/IntentOverTimeChart";
import { TopIndustriesList } from "@/components/dashboard/TopIndustriesList";
import { SourceBreakdown } from "@/components/dashboard/SourceBreakdown";
import { backendFetchSafe } from "@/lib/api";
import { EMPTY_SUMMARY } from "@/lib/constants";
import { getMeta } from "@/lib/meta";
import { formatNumber } from "@/lib/format";
import type {
  DashboardSummary,
  IntentOverTime,
  SourceBreakdownRow,
  TopIndustries,
} from "@/lib/types";

export const dynamic = "force-dynamic";

const RANGES = [
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
];

const BAND_TONES: Record<string, string> = {
  "0-25": "from-neutral to-neutral",
  "25-50": "from-warn to-warn",
  "50-75": "from-accent to-accent",
  "75-100": "from-accent to-cyan",
};

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { range = "30d" } = await searchParams;

  const [summary, intent, industries, sources, meta] = await Promise.all([
    backendFetchSafe<DashboardSummary>(
      `/analytics/summary/?range=${range}`,
      EMPTY_SUMMARY
    ),
    backendFetchSafe<IntentOverTime>(`/analytics/intent-over-time/?range=${range}`, {
      granularity: "weekly",
      series: [],
      has_enough_history: false,
      min_points: 3,
    }),
    backendFetchSafe<TopIndustries>("/analytics/top-industries/", {
      results: [],
      total_leads: 0,
      show_shares: false,
    }),
    backendFetchSafe<{ results: SourceBreakdownRow[] }>("/analytics/sources/", {
      results: [],
    }),
    getMeta(),
  ]);

  // The bands and their order come from the same place that computed the
  // counts, so adding a bucket in Django doesn't need a matching edit here.
  const bands = meta.score_bands.map((b) => b.label);

  const distribution = summary.score_distribution ?? {};
  const maxBand = Math.max(...bands.map((b) => distribution[b] ?? 0), 1);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[32px] font-semibold tracking-tight text-hi">
            Analytics
          </h1>
          <p className="mt-1.5 text-[15px] text-muted">
            How leads arrive, how they score, and where intent is moving.
          </p>
        </div>
        <div className="flex gap-1.5">
          {RANGES.map((option) => (
            <FilterPill
              key={option.key}
              href={`/dashboard/analytics?range=${option.key}`}
              active={range === option.key}
            >
              {option.label}
            </FilterPill>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr] items-start">
        <Card>
          <CardHeader>
            <CardTitle>Intent over time</CardTitle>
            <span className="label-mono shrink-0">{intent.granularity}</span>
          </CardHeader>
          <CardBody>
            <IntentOverTimeChart data={intent} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Average score</CardTitle>
              <p className="text-xs text-muted mt-1">
                Across {formatNumber(summary.scored_lead_count)} scored{" "}
                {summary.scored_lead_count === 1 ? "lead" : "leads"}
              </p>
            </div>
          </CardHeader>
          <CardBody>
            {summary.avg_score == null ? (
              // Null means nothing has been scored — not that the average is
              // zero, which is what a "0" here would claim.
              <p className="py-6 text-center text-sm text-muted">
                No leads have been scored yet.
              </p>
            ) : (
              <div className="flex items-center gap-5">
                <GaugeRing value={Math.round(summary.avg_score)} size={76} />
                <div className="min-w-0">
                  <p className="font-mono tabular text-3xl text-hi leading-none">
                    {Math.round(summary.avg_score)}
                  </p>
                  <p className="mt-2 text-xs text-muted">out of 100</p>
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3 items-start">
        <Card>
          <CardHeader>
            <CardTitle>Score distribution</CardTitle>
          </CardHeader>
          <CardBody>
            {summary.scored_lead_count === 0 ? (
              <p className="py-6 text-center text-sm text-muted">
                Nothing scored yet.
              </p>
            ) : (
              <ul className="space-y-4">
                {bands.map((band) => {
                  const count = distribution[band] ?? 0;
                  return (
                    <li key={band}>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="font-mono text-[13px] text-body">
                          {band}
                        </span>
                        <span className="font-mono tabular text-[13px] text-muted">
                          {count}
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                        <div
                          className={`h-full rounded-full bg-gradient-to-r ${BAND_TONES[band]}`}
                          style={{ width: `${(count / maxBand) * 100}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lead sources</CardTitle>
          </CardHeader>
          <CardBody>
            <SourceBreakdown rows={sources.results} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top industries</CardTitle>
          </CardHeader>
          <CardBody>
            <TopIndustriesList data={industries} />
          </CardBody>
        </Card>
      </div>

      {/*
        Names the gap rather than filling it with a metric we can't compute.
        A "conversion rate" here would need outcome data nothing captures.
      */}
      <Card variant="solid">
        <CardHeader>
          <CardTitle>Not reported yet</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="text-[13px] leading-relaxed text-muted text-pretty max-w-3xl">
            Conversion, win rate and score accuracy need outcome data —
            whether an account replied, met, or closed. Vantage doesn&apos;t
            capture any of that yet, so those figures are absent rather than
            estimated. They arrive with CRM sync.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
