import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, MessageSquare } from "lucide-react";
import {
  Avatar,
  Badge,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
} from "@/components/ui";
import { StatusPill } from "@/components/dashboard/StatusPill";
import { ScoreBadge } from "@/components/dashboard/ScoreBadge";
import { LeadActions } from "@/components/dashboard/LeadActions";
import { backendFetch } from "@/lib/api";
import { SOURCE_LABELS } from "@/lib/constants";
import { formatDateTime, formatRelative } from "@/lib/format";
import type { AssignmentUser, LeadDetail, PaginatedResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let lead: LeadDetail;
  let team: AssignmentUser[] = [];
  try {
    const [leadData, teamData] = await Promise.all([
      backendFetch<LeadDetail>(`/leads/${id}/`),
      backendFetch<PaginatedResponse<AssignmentUser>>("/team/"),
    ]);
    lead = leadData;
    team = teamData.results;
  } catch {
    notFound();
  }

  const { qualification, score, company, activity, assignment } = lead;

  return (
    <div className="space-y-4">
      <Link
        href="/dashboard/leads"
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-hi transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Leads
      </Link>

      <Card>
        <CardBody className="flex flex-wrap items-start gap-4">
          <Avatar name={lead.contact_name} size={44} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-semibold text-hi">{lead.contact_name}</h1>
              <StatusPill status={lead.status} />
              <ScoreBadge score={score} />
            </div>
            <p className="mt-0.5 text-sm text-muted">
              {[lead.email, lead.phone, SOURCE_LABELS[lead.source]].filter(Boolean).join(" · ")}
            </p>
          </div>
          <LeadActions
            leadId={lead.id}
            team={team}
            currentAssigneeId={assignment?.user.id}
          />
        </CardBody>
      </Card>

      <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-3">
          <Card>
            <CardHeader><CardTitle>AI qualification</CardTitle></CardHeader>
            <CardBody className="space-y-4">
              {!qualification ? (
                <EmptyState
                  compact
                  icon={MessageSquare}
                  title="Not qualified yet"
                  body={
                    lead.status === "failed"
                      ? "Qualification failed — see the activity trail below for why."
                      : "This lead is still being processed."
                  }
                />
              ) : (
                <>
                  {qualification.ai_summary && (
                    <p className="text-sm text-body leading-relaxed">{qualification.ai_summary}</p>
                  )}

                  {qualification.pain_points.length > 0 && (
                    <div>
                      <p className="text-xs uppercase tracking-wide text-faint mb-1.5">Pain points</p>
                      <ul className="space-y-1">
                        {qualification.pain_points.map((point) => (
                          <li key={point} className="flex gap-2 text-sm text-body">
                            <span className="mt-1.5 w-1 h-1 rounded-full bg-accent shrink-0" />
                            {point}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="grid sm:grid-cols-2 gap-4">
                    {qualification.recommended_service && (
                      <div>
                        <p className="text-xs uppercase tracking-wide text-faint mb-1">Recommended service</p>
                        <p className="text-sm text-body">{qualification.recommended_service}</p>
                      </div>
                    )}
                    {qualification.recommended_action && (
                      <div>
                        <p className="text-xs uppercase tracking-wide text-faint mb-1">Recommended action</p>
                        <p className="text-sm text-body">{qualification.recommended_action}</p>
                      </div>
                    )}
                  </div>

                  <p className="text-[11px] text-faint">
                    Model: <span className="font-mono">{qualification.model_used || "—"}</span>
                  </p>
                </>
              )}
            </CardBody>
          </Card>

          {lead.message && (
            <Card>
              <CardHeader><CardTitle>Original message</CardTitle></CardHeader>
              <CardBody>
                <p className="text-sm text-body whitespace-pre-wrap leading-relaxed">
                  {lead.message}
                </p>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle>Activity</CardTitle></CardHeader>
            <CardBody>
              <ol className="space-y-3">
                {activity.map((entry) => (
                  <li key={entry.id} className="flex gap-2.5">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-line-strong shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-body">{entry.description || entry.type}</p>
                      <p className="text-xs text-faint">{formatRelative(entry.created_at)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-3">
          {company && (
            <Card>
              <CardHeader><CardTitle>Company</CardTitle></CardHeader>
              <CardBody>
                <Link
                  href={`/dashboard/accounts/${company.id}`}
                  className="text-sm text-hi hover:text-accent transition-colors"
                >
                  {company.name}
                </Link>
                <dl className="mt-3 space-y-2">
                  <Row label="Industry" value={company.industry || "—"} />
                  <Row label="Employees" value={company.employee_count?.toLocaleString() || "—"} />
                  <Row label="Website" value={company.website || "—"} />
                </dl>
              </CardBody>
            </Card>
          )}

          {score && (
            <Card>
              <CardHeader><CardTitle>Score breakdown</CardTitle></CardHeader>
              <CardBody>
                <dl className="space-y-2">
                  <Row label="ICP fit" value={String(score.icp_fit_score)} />
                  <Row label="Intent" value={score.buying_intent} />
                  <Row label="Urgency" value={score.urgency} />
                  <Row label="Total" value={String(score.total_score)} />
                </dl>
                <p className="mt-3 text-[11px] text-faint">
                  Computed {formatDateTime(score.computed_at)}
                </p>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle>Assigned to</CardTitle></CardHeader>
            <CardBody>
              {assignment ? (
                <div className="flex items-center gap-2.5">
                  <Avatar name={assignment.user.username} size={28} />
                  <div>
                    <p className="text-sm text-hi">{assignment.user.username}</p>
                    <p className="text-xs text-faint">
                      {formatRelative(assignment.assigned_at)}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted">Unassigned</p>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-sm text-body font-mono tabular capitalize truncate">{value}</dd>
    </div>
  );
}
