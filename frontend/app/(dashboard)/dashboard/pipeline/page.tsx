import { Workflow } from "lucide-react";
import { Card, CardBody, EmptyState } from "@/components/ui";
import { PipelineBoard } from "@/components/dashboard/PipelineBoard";
import { SearchSync } from "@/components/shell/SearchSync";
import { backendFetchSafe } from "@/lib/api";
import { getMeta } from "@/lib/meta";
import type { CompanyListItem, PaginatedResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>;
}) {
  const { search = "" } = await searchParams;

  // Fetches the same paginated /companies/ endpoint Accounts does, and is a
  // full browse-all-researched-accounts board rather than a capped preview —
  // so it gets the same accurate server search, not a client-only filter
  // over whatever page happened to load.
  const [accounts, meta] = await Promise.all([
    backendFetchSafe<PaginatedResponse<CompanyListItem>>(
      `/companies/?researched=true${search ? `&search=${encodeURIComponent(search)}` : ""}`,
      { count: 0, next: null, previous: null, results: [] }
    ),
    getMeta(),
  ]);

  // Which stages exist, and which accept a drop, is the backend's call — the
  // explainer below names them from that list rather than restating it.
  const manual = meta.pipeline_stages.filter((s) => s.manual).map((s) => s.label);
  const derived = meta.pipeline_stages
    .filter((s) => !s.manual)
    .map((s) => s.label);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-[32px] font-semibold tracking-tight text-hi">
          Pipeline
        </h1>
        <p className="mt-1.5 text-[15px] text-muted">
          Every researched account by stage.
        </p>
      </div>

      {/*
        States the division of labour up front, because it explains why three
        of the five columns refuse a drop.
      */}
      {meta.pipeline_stages.length > 0 && (
        <Card variant="solid" className="px-5 py-3.5">
          <p className="text-[13px] leading-relaxed text-muted text-pretty">
            <span className="text-body">{derived.join(", ")}</span>{" "}
            {derived.length === 1 ? "is" : "are"} computed from research and
            update on every run.{" "}
            <span className="text-body">{manual.join(" and ")}</span> can only
            be set by you — Vantage doesn&apos;t see replies, meetings or
            closed deals, so it can&apos;t honestly infer them.
          </p>
        </Card>
      )}

      <SearchSync />

      {accounts.results.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={Workflow}
              title={search ? "No accounts match your search" : "No researched accounts yet"}
              body={
                search
                  ? `Nothing here mentions "${search}".`
                  : "Research a company and it enters the board automatically at the stage its ICP score supports."
              }
            />
          </CardBody>
        </Card>
      ) : (
        <PipelineBoard
          accounts={accounts.results}
          stages={meta.pipeline_stages}
        />
      )}
    </div>
  );
}
