"use client";

import { useState } from "react";
import {
  AlertCircle,
  Check,
  Copy,
  Lightbulb,
  Search,
  Sparkles,
  TrendingUp,
} from "lucide-react";
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
import { cn } from "@/lib/cn";
import { formatRelative } from "@/lib/format";
import type { BuyingIntent, ResearchJob } from "@/lib/types";

const INTENT_TONE: Record<BuyingIntent, "ok" | "warn" | "info" | "neutral"> = {
  high: "ok",
  warm: "warn",
  medium: "info",
  low: "neutral",
  unknown: "neutral",
};

export function ResearchResult({ job }: { job: ResearchJob }) {
  const { company, result, claims, signals, sources } = job;
  if (!company) return null;

  const whyClaims = claims.filter((c) => c.category === "icp" || c.category === "profile");
  const challengeClaims = claims.filter((c) => c.category === "challenge");

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardBody className="flex flex-wrap items-start gap-4">
          <Avatar name={company.name} size={48} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-semibold text-hi truncate">{company.name}</h2>
              {company.verified && (
                <Badge tone="info" dot>
                  Verified
                </Badge>
              )}
              {job.cached && (
                <Badge tone="neutral">
                  Researched {formatRelative(result?.computed_at)}
                </Badge>
              )}
            </div>
            <p className="mt-0.5 text-sm text-muted">
              {[company.domain, company.industry, company.location]
                .filter(Boolean)
                .join(" · ") || "No profile details found"}
            </p>
            {company.description && (
              <p className="mt-2 text-sm text-body">{company.description}</p>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Scores */}
      {result && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ScoreTile
            label="ICP Fit"
            value={<GaugeRing value={result.icp_fit_score} size={52} />}
            caption={result.icp_fit_label || "—"}
          />
          <ScoreTile
            label="Buying Intent"
            value={
              <span className="text-2xl font-semibold text-hi capitalize">
                {result.buying_intent}
              </span>
            }
            caption={
              result.intent_delta_pct == null ? (
                // Nothing to compare a first run against — say so rather than
                // rendering a "+0%" that implies a measured flat trend.
                <span className="inline-flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> First research
                </span>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  {result.intent_delta_pct > 0 ? "+" : ""}
                  {result.intent_delta_pct} vs last run
                </span>
              )
            }
          />
          <ScoreTile
            label="Engagement"
            value={<GaugeRing value={result.engagement_score} size={52} />}
            // Deliberately null: this product has no engagement data yet, so
            // showing a number here would be inventing one.
            caption={result.engagement_score == null ? "Not tracked yet" : "Measured"}
          />
          <ScoreTile
            label="Research Confidence"
            value={
              <span className="text-2xl font-semibold text-hi font-mono tabular">
                {result.research_confidence}%
              </span>
            }
            caption={`${sources.length} source${sources.length === 1 ? "" : "s"}`}
          />
        </div>
      )}

      {/* Why this account */}
      <Card>
        <CardHeader>
          <CardTitle>Why this account?</CardTitle>
          <span className="text-xs text-faint">{claims.length} findings</span>
        </CardHeader>
        <CardBody>
          {whyClaims.length === 0 && challengeClaims.length === 0 ? (
            <EmptyState
              compact
              icon={Search}
              title="No findings"
              body="The research run didn't produce any supported claims for this company."
            />
          ) : (
            <ul className="space-y-3">
              {[...whyClaims, ...challengeClaims].map((claim) => (
                <li key={claim.id} className="flex gap-3">
                  <span
                    className={cn(
                      "mt-0.5 w-4 h-4 rounded-full flex items-center justify-center shrink-0",
                      claim.unsourced
                        ? "border border-line"
                        : "bg-ok-soft"
                    )}
                  >
                    {claim.unsourced ? (
                      <span className="w-1 h-1 rounded-full bg-faint" />
                    ) : (
                      <Check className="w-2.5 h-2.5 text-ok" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-body">{claim.text}</p>
                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                      <ConfidenceBar
                        confidence={claim.confidence}
                        unsourced={claim.unsourced}
                      />
                      {/* An inferred claim is visually distinct from a sourced
                          one so the reader can weigh them differently. */}
                      {claim.unsourced && <Badge tone="neutral">inferred</Badge>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* Summary + signals */}
      <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>AI Research Summary</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            {result?.summary ? (
              <p className="text-sm text-body leading-relaxed">{result.summary}</p>
            ) : (
              <p className="text-sm text-muted">No summary produced.</p>
            )}

            {result?.current_challenge && (
              <Section title="Current challenge">{result.current_challenge}</Section>
            )}
            {result?.potential_need && (
              <Section title="Potential need">{result.potential_need}</Section>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent signals</CardTitle>
          </CardHeader>
          <CardBody>
            {signals.length === 0 ? (
              <EmptyState
                compact
                icon={AlertCircle}
                title="No signals found"
                body="Nothing recent surfaced in public sources for this company."
              />
            ) : (
              <ul className="space-y-2.5">
                {signals.map((signal) => (
                  <li key={signal.id} className="flex items-start gap-2.5">
                    <Badge
                      tone={signal.strength === "high" ? "ok" : signal.strength === "medium" ? "info" : "neutral"}
                      className="capitalize shrink-0"
                    >
                      {signal.type}
                    </Badge>
                    <div className="min-w-0">
                      <p className="text-sm text-body">{signal.value}</p>
                      {signal.detected_at && (
                        <p className="text-xs text-faint">
                          {formatRelative(signal.detected_at)}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Recommendation */}
      {result && (result.recommended_outreach || result.recommended_services.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-accent" />
              Recommended next step
            </CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            {result.recommended_services.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {result.recommended_services.map((service) => (
                  <Badge key={service.title} tone="accent" className="py-1">
                    {service.title}
                  </Badge>
                ))}
              </div>
            )}
            {result.recommended_outreach && (
              <OutreachCard
                subject={result.outreach_subject}
                body={result.recommended_outreach}
              />
            )}
          </CardBody>
        </Card>
      )}

      {/* Sources */}
      <Card>
        <CardHeader>
          <CardTitle>Sources</CardTitle>
          <span className="text-xs text-faint">{sources.length}</span>
        </CardHeader>
        <CardBody>
          {sources.length === 0 ? (
            <EmptyState
              compact
              icon={Search}
              title="No public sources found"
              body="Every claim above is therefore an inference, marked accordingly."
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              {sources.map((source) => (
                <SourceChip key={source.id} source={source} />
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function ScoreTile({
  label,
  value,
  caption,
}: {
  label: string;
  value: React.ReactNode;
  caption: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted">{label}</p>
      <div className="mt-2 flex items-center gap-3">{value}</div>
      <p className="mt-2 text-xs text-faint">{caption}</p>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-faint mb-1">{title}</p>
      <p className="text-sm text-body leading-relaxed">{children}</p>
    </div>
  );
}

function OutreachCard({ subject, body }: { subject: string; body: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(
      subject ? `Subject: ${subject}\n\n${body}` : body
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-lg bg-sunken border border-line p-4">
      {subject && (
        <p className="text-sm font-medium text-hi mb-2">{subject}</p>
      )}
      <p className="text-sm text-body leading-relaxed whitespace-pre-wrap">{body}</p>
      <div className="mt-3">
        <Button size="sm" variant="secondary" onClick={copy}>
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}
