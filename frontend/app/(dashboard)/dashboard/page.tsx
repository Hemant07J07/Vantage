import Link from "next/link";
import { Badge, Card, CardBody, CardHeader, CardTitle, FilterPill, StatCard } from "@/components/ui";
import { IntentOverTimeChart } from "@/components/dashboard/IntentOverTimeChart";
import { TopIndustriesList } from "@/components/dashboard/TopIndustriesList";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { InsightsPanel } from "@/components/dashboard/InsightsPanel";
import { PriorityAccountsList } from "@/components/dashboard/PriorityAccountsList";
import { SignalFeed } from "@/components/dashboard/SignalFeed";
import { SourceBreakdown } from "@/components/dashboard/SourceBreakdown";
import { SummaryStrip } from "@/components/dashboard/SummaryStrip";
import { backendFetchSafe } from "@/lib/api";
import { EMPTY_SUMMARY } from "@/lib/constants";
import { getMeta } from "@/lib/meta";
import type {
  ActivityRow,
  CompanyListItem,
  DashboardSummary,
  FeedSignal,
  Insight,
  IntentOverTime,
  PaginatedResponse,
  SourceBreakdownRow,
  TopIndustries,
} from "@/lib/types";

export const dynamic = "force-dynamic";

const RANGES = [
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
];

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { range = "30d" } = await searchParams;

  // Each panel degrades independently: one failing endpoint shouldn't take the
  // whole page down with it.
  const [
    summary,
    intent,
    industries,
    activity,
    insights,
    accounts,
    signals,
    sources,
    meta,
  ] = await Promise.all([
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
    backendFetchSafe<{ results: ActivityRow[] }>("/analytics/activity/?limit=8", { results: [] }),
    backendFetchSafe<{ results: Insight[] }>("/analytics/insights/", { results: [] }),
    backendFetchSafe<PaginatedResponse<CompanyListItem>>("/companies/?researched=true", {
      count: 0,
      next: null,
      previous: null,
      results: [],
    }),
    backendFetchSafe<{ results: FeedSignal[] }>("/analytics/signals/?limit=6", {
      results: [],
    }),
    backendFetchSafe<{ results: SourceBreakdownRow[] }>("/analytics/sources/", {
      results: [],
    }),
    getMeta(),
  ]);

  const priority = accounts.results.slice(0, 5);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[32px] font-semibold tracking-tight text-hi">
            Overview
          </h1>
          <p className="mt-1.5 text-[15px] text-muted">
            Live intelligence across your pipeline — every claim traced to a source.
          </p>
        </div>
        <div className="flex gap-1.5">
          {RANGES.map((option) => (
            <FilterPill
              key={option.key}
              href={`/dashboard?range=${option.key}`}
              active={range === option.key}
            >
              {option.label}
            </FilterPill>
          ))}
        </div>
      </div>

      <SummaryStrip
        summary={summary}
        rangeDays={summary.range_days}
        researchedCount={accounts.count}
        signalCount={signals.results.length}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Leads" metric={summary.total_leads} />
        <StatCard label="Qualified Leads" metric={summary.qualified_leads} tone="ok" />
        <StatCard label="High Intent" metric={summary.high_intent} tone="cyan" />
        <StatCard label="Actions Pending" metric={summary.actions_pending} tone="warn" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr] items-start">
        <Card className="overflow-hidden">
          <CardHeader>
            <div>
              <CardTitle>Signal feed</CardTitle>
              <p className="text-xs text-muted mt-1">
                What changed this week across your accounts
              </p>
            </div>
            <span className="label-mono shrink-0">
              {signals.results.length} recent
            </span>
          </CardHeader>
          <SignalFeed
            signals={signals.results}
            unsourcedConfidenceCap={meta.thresholds.unsourced_confidence_cap}
          />
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Agent stream</CardTitle>
            <Link
              href="/dashboard/activity"
              className="text-xs text-accent hover:underline shrink-0"
            >
              View all
            </Link>
          </CardHeader>
          <CardBody>
            <ActivityFeed rows={activity.results} />
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr] items-start">
        <Card className="overflow-hidden">
          <CardHeader>
            <div>
              <CardTitle>AI Priority Accounts</CardTitle>
              <p className="text-xs text-muted mt-0.5">Researched accounts, best fit first</p>
            </div>
            <Link href="/dashboard/accounts" className="text-xs text-accent hover:underline">
              View all
            </Link>
          </CardHeader>

          <PriorityAccountsList accounts={priority} />
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>AI Insights</CardTitle>
          </CardHeader>
          <InsightsPanel insights={insights.results} />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3 items-start">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Intent over time</CardTitle>
            <span className="label-mono shrink-0">Weekly</span>
          </CardHeader>
          <CardBody>
            <IntentOverTimeChart data={intent} />
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

      <div className="grid gap-4 lg:grid-cols-3 items-start">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Lead sources</CardTitle>
              <p className="text-xs text-muted mt-1">
                Volume and average qualification score by channel
              </p>
            </div>
          </CardHeader>
          <CardBody>
            <SourceBreakdown rows={sources.results} />
          </CardBody>
        </Card>

        {/* Static and honest: how the scores are produced, so a number on this
            page can always be traced back to a method. */}
        <Card>
          <CardHeader>
            <CardTitle>Method</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3.5">
            <p className="text-[13px] leading-relaxed text-muted text-pretty">
              Every account is researched in five steps — profile, signals,
              analysis, ICP fit, then a recommendation. Claims are tied to the
              pages they came from.
            </p>
            <p className="text-[13px] leading-relaxed text-muted text-pretty">
              Anything nothing backs up is marked{" "}
              <Badge tone="warn" variant="pill">
                Inferred
              </Badge>{" "}
              and its confidence is capped at{" "}
              {Math.round(meta.thresholds.unsourced_confidence_cap * 100)}%, so a
              model guess never reads
              as solidly as a cited fact.
            </p>
            <p className="text-[13px] leading-relaxed text-muted text-pretty">
              Scoring blends deterministic ICP rules with the model&apos;s read,
              which keeps results stable when the model changes.
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
