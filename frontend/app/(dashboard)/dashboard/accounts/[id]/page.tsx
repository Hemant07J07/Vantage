import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Building2, Search } from "lucide-react";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  ConfidenceBar,
  EmptyState,
  GaugeRing,
  SourceChip,
} from "@/components/ui";
import { backendFetch } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatRelative } from "@/lib/format";
import type { AccountDetail, MonitoringState } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let data: AccountDetail;
  try {
    data = await backendFetch<AccountDetail>(`/companies/${id}/`);
  } catch {
    notFound();
  }

  const { company, intelligence, claims, signals, sources, monitoring } = data;

  return (
    <div className="space-y-4">
      <Link
        href="/dashboard/accounts"
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-hi transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Accounts
      </Link>

      <Card>
        <CardBody className="flex flex-wrap items-start gap-4">
          <Avatar name={company.name} size={48} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-semibold text-hi">{company.name}</h1>
              {company.verified && <Badge tone="info" dot>Verified</Badge>}
            </div>
            <p className="mt-0.5 text-sm text-muted">
              {[company.domain, company.industry, company.location].filter(Boolean).join(" · ") ||
                "No profile details"}
            </p>
            {company.description && (
              <p className="mt-2 text-sm text-body">{company.description}</p>
            )}
            <MonitoringLine monitoring={monitoring} />
          </div>
        </CardBody>
      </Card>

      {!intelligence ? (
        <Card>
          <EmptyState
            icon={Search}
            title="Not researched yet"
            body="Run research to build an evidence-backed brief for this account."
            action={
              <Link href="/dashboard/research">
                <Button variant="primary">Research this account</Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile label="ICP Fit" caption={intelligence.icp_fit_label || "—"}>
              <GaugeRing value={intelligence.icp_fit_score} size={52} />
            </Tile>
            <Tile
              label="Buying Intent"
              caption={
                intelligence.intent_delta_pct == null
                  ? "First research"
                  : `${intelligence.intent_delta_pct > 0 ? "+" : ""}${intelligence.intent_delta_pct} vs last run`
              }
            >
              <span className="text-2xl font-semibold text-hi capitalize">
                {intelligence.buying_intent}
              </span>
            </Tile>
            <Tile
              label="Engagement"
              caption={intelligence.engagement_score == null ? "Not tracked yet" : "Measured"}
            >
              <GaugeRing value={intelligence.engagement_score} size={52} />
            </Tile>
            <Tile
              label="Research Confidence"
              caption={`${sources.length} source${sources.length === 1 ? "" : "s"}`}
            >
              <span className="text-2xl font-semibold text-hi font-mono tabular">
                {intelligence.research_confidence}%
              </span>
            </Tile>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr]">
            <Card>
              <CardHeader><CardTitle>AI Research Summary</CardTitle></CardHeader>
              <CardBody className="space-y-4">
                {intelligence.summary ? (
                  <p className="text-sm text-body leading-relaxed">{intelligence.summary}</p>
                ) : (
                  <p className="text-sm text-muted">No summary produced.</p>
                )}
                {intelligence.current_challenge && (
                  <Field title="Current challenge">{intelligence.current_challenge}</Field>
                )}
                {intelligence.potential_need && (
                  <Field title="Potential need">{intelligence.potential_need}</Field>
                )}
                {intelligence.recommended_outreach && (
                  <Field title="Recommended outreach">
                    <span className="whitespace-pre-wrap">{intelligence.recommended_outreach}</span>
                  </Field>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader><CardTitle>Signals</CardTitle></CardHeader>
              <CardBody>
                {signals.length === 0 ? (
                  <EmptyState compact icon={Building2} title="No signals found" />
                ) : (
                  <ul className="space-y-2.5">
                    {signals.map((signal) => (
                      <li key={signal.id} className="flex items-start gap-2.5">
                        <Badge tone="info" className="capitalize shrink-0">{signal.type}</Badge>
                        <div className="min-w-0">
                          <p className="text-sm text-body">{signal.value}</p>
                          {signal.detected_at && (
                            <p className="text-xs text-faint">{formatRelative(signal.detected_at)}</p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Findings</CardTitle>
              <span className="text-xs text-faint">{claims.length}</span>
            </CardHeader>
            <CardBody>
              {claims.length === 0 ? (
                <EmptyState compact icon={Search} title="No findings recorded" />
              ) : (
                <ul className="space-y-3">
                  {claims.map((claim) => (
                    <li key={claim.id} className="flex gap-3">
                      <span
                        className={cn(
                          "mt-1 w-1.5 h-1.5 rounded-full shrink-0",
                          claim.unsourced ? "bg-faint" : "bg-ok"
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-body">{claim.text}</p>
                        <div className="mt-1 flex items-center gap-2 flex-wrap">
                          <Badge tone="neutral" className="capitalize">{claim.category}</Badge>
                          <ConfidenceBar confidence={claim.confidence} unsourced={claim.unsourced} />
                          {claim.unsourced && <Badge tone="neutral">inferred</Badge>}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sources</CardTitle>
              <span className="text-xs text-faint">{sources.length}</span>
            </CardHeader>
            <CardBody>
              {sources.length === 0 ? (
                <EmptyState compact icon={Search} title="No public sources found" />
              ) : (
                <div className="flex flex-wrap gap-2">
                  {sources.map((source) => (
                    <SourceChip key={source.id} source={source} />
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}

function Tile({
  label,
  caption,
  children,
}: {
  label: string;
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted">{label}</p>
      <div className="mt-2 flex items-center gap-3">{children}</div>
      <p className="mt-2 text-xs text-faint">{caption}</p>
    </Card>
  );
}

function Field({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-faint mb-1">{title}</p>
      <p className="text-sm text-body leading-relaxed">{children}</p>
    </div>
  );
}

/**
 * What monitoring knows about this account, or plainly that it knows nothing.
 *
 * Four states are kept distinct, because flattening them to a single "last
 * checked" date would be the dishonest version: an account whose site can't be
 * reached has not been confirmed unchanged, and one that has never been
 * checked has no freshness to report at all.
 */
function MonitoringLine({ monitoring }: { monitoring: MonitoringState | null }) {
  if (!monitoring || !monitoring.last_result || !monitoring.last_checked_at) {
    return (
      <p className="mt-2 text-xs text-faint">
        Not yet checked for changes.
      </p>
    );
  }

  const when = formatRelative(monitoring.last_checked_at);

  if (monitoring.last_result === "unreachable") {
    return (
      <p className="mt-2 text-xs text-warn">
        Couldn&apos;t be checked {when} — {monitoring.last_reason}
      </p>
    );
  }

  if (monitoring.last_result === "changed") {
    return (
      <p className="mt-2 text-xs text-faint">
        <span className="text-body">Change detected {when}</span>
        {monitoring.last_reason && ` — ${monitoring.last_reason}`}
      </p>
    );
  }

  return (
    <p className="mt-2 text-xs text-faint">
      No change as of {when}
    </p>
  );
}
