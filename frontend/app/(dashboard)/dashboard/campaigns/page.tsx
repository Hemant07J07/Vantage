import Link from "next/link";
import { Megaphone } from "lucide-react";
import {
  Avatar,
  Badge,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
} from "@/components/ui";
import { SearchSync } from "@/components/shell/SearchSync";
import { backendFetchSafe } from "@/lib/api";
import { formatRelative } from "@/lib/format";
import type { CompanyListItem, PaginatedResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>;
}) {
  const { search = "" } = await searchParams;

  // The only outreach that actually exists: one AI-drafted email per account,
  // written during research. There is no campaign engine behind this.
  //
  // Filtered by the backend rather than here — a client-side filter could
  // only ever see the page it was handed, so accounts past the first 25
  // silently went missing from the count and the list.
  const accounts = await backendFetchSafe<PaginatedResponse<CompanyListItem>>(
    `/companies/?researched=true&has_outreach=true${
      search ? `&search=${encodeURIComponent(search)}` : ""
    }`,
    { count: 0, next: null, previous: null, results: [] }
  );

  const drafts = accounts.results;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-[32px] font-semibold tracking-tight text-hi">
          Campaigns
        </h1>
        <p className="mt-1.5 text-[15px] text-muted">
          Outreach drafted from each account&apos;s research.
        </p>
      </div>

      {/*
        Stated plainly and at the top. The reference design shows open and
        reply rates here; there is no sending, tracking or campaign model in
        this system, so those numbers would be invented outright.
      */}
      <Card variant="solid" className="px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="warn" variant="pill">
            Not built
          </Badge>
          <p className="flex-1 min-w-[260px] text-[13px] leading-relaxed text-muted text-pretty">
            Sequences, sending and reply tracking don&apos;t exist yet — there
            is no campaign backend. What&apos;s below is the real draft
            Vantage wrote for each account; copy it into your own mail client.
            No open or reply rates are shown because none are measured.
          </p>
        </div>
      </Card>

      <SearchSync />

      <Card className="overflow-hidden">
        <CardHeader>
          <div>
            <CardTitle>Drafted outreach</CardTitle>
            <p className="text-xs text-muted mt-1">
              One per researched account · not yet sendable
            </p>
          </div>
          <span className="label-mono shrink-0">{accounts.count} drafts</span>
        </CardHeader>

        {drafts.length === 0 ? (
          <EmptyState
            icon={Megaphone}
            title={search ? "No drafts match your search" : "No drafts yet"}
            body={
              search
                ? `Nothing here mentions "${search}".`
                : "Research an account and Vantage writes a first-touch email for it, grounded in what it found."
            }
          />
        ) : (
          <ul>
            {drafts.map((account) => {
              const intel = account.intelligence!;
              return (
                <li
                  key={account.id}
                  className="border-t border-line px-5 py-4 transition-colors hover:bg-white/[0.02]"
                >
                  <div className="flex items-start gap-3">
                    <Avatar name={account.name} size={32} />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/dashboard/accounts/${account.id}`}
                          className="font-display text-[15px] font-semibold text-hi hover:text-accent transition-colors truncate"
                        >
                          {account.name}
                        </Link>
                        <Badge tone="neutral" variant="pill">
                          Draft
                        </Badge>
                        <span className="ml-auto font-mono text-[11px] text-faint shrink-0">
                          {formatRelative(intel.computed_at)}
                        </span>
                      </div>

                      {intel.outreach_subject && (
                        <p className="mt-2 text-sm font-medium text-body">
                          {intel.outreach_subject}
                        </p>
                      )}

                      <p className="mt-1.5 line-clamp-3 whitespace-pre-line text-[13px] leading-relaxed text-muted">
                        {intel.recommended_outreach}
                      </p>

                      <Link
                        href={`/dashboard/accounts/${account.id}`}
                        className="mt-2.5 inline-block font-mono text-[11px] text-accent hover:underline"
                      >
                        Open account →
                      </Link>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card variant="solid">
        <CardHeader>
          <CardTitle>Planned</CardTitle>
        </CardHeader>
        <CardBody>
          <ul className="space-y-2.5">
            {[
              "Multi-step sequences triggered by a signal — a funding round, a hiring push",
              "Sending through your own mailbox, with replies tracked back to the account",
              "Per-variant results, once there are real sends to measure",
            ].map((item) => (
              <li
                key={item}
                className="flex gap-3 text-[13px] leading-relaxed text-muted"
              >
                <span className="mt-2 w-1 h-1 rounded-full bg-accent shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
