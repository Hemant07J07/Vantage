"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Inbox } from "lucide-react";
import { Avatar, Card, EmptyState, Table, Td, Th, Tr } from "@/components/ui";
import { useLeadEvents } from "@/components/providers/LiveProvider";
import { useSearch } from "@/components/providers/SearchProvider";
import { StatusPill } from "./StatusPill";
import { ScoreBadge } from "./ScoreBadge";
import { SOURCE_LABELS } from "@/lib/constants";
import { formatRelative } from "@/lib/format";
import type { LeadListItem } from "@/lib/types";

export function LeadsTable({ initialLeads }: { initialLeads: LeadListItem[] }) {
  const [leads, setLeads] = useState(initialLeads);
  // Filtering already happened server-side (the page reads `?search=` and
  // queries the backend) — this is only to phrase the empty state honestly
  // when a search returned nothing, rather than claiming no leads exist at all.
  const { query } = useSearch();

  // Re-sync when the server sends a different set (e.g. the status filter
  // changed). Without this the table keeps showing whatever it first mounted
  // with, because state seeded from props doesn't follow later prop changes.
  useEffect(() => {
    setLeads(initialLeads);
  }, [initialLeads]);

  useLeadEvents({
    onQualified: (updated) =>
      setLeads((prev) => {
        const exists = prev.some((lead) => lead.id === updated.id);
        return exists
          ? prev.map((lead) => (lead.id === updated.id ? updated : lead))
          : [updated, ...prev];
      }),
    onStatus: (leadId, status) =>
      setLeads((prev) =>
        prev.map((lead) => (lead.id === leadId ? { ...lead, status } : lead))
      ),
  });

  if (leads.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Inbox}
          title={query ? "No leads match your search" : "No leads yet"}
          body={
            query
              ? `Nothing here mentions "${query}".`
              : "New submissions appear here in real time as they're qualified."
          }
        />
      </Card>
    );
  }

  return (
    <Card variant="solid" className="overflow-hidden">
      <Table>
        <thead className="border-b border-line">
          <tr>
            <Th>Contact</Th>
            <Th>Company</Th>
            <Th className="hidden md:table-cell">Source</Th>
            <Th>Status</Th>
            <Th>Score</Th>
            <Th className="hidden sm:table-cell">Submitted</Th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => (
            <Tr key={lead.id}>
              <Td>
                <Link
                  href={`/dashboard/leads/${lead.id}`}
                  className="flex items-center gap-2.5 group"
                >
                  <Avatar name={lead.contact_name} size={28} />
                  <span className="min-w-0">
                    <span className="block text-sm text-hi truncate group-hover:text-accent transition-colors">
                      {lead.contact_name}
                    </span>
                    <span className="block text-xs text-faint truncate">{lead.email}</span>
                  </span>
                </Link>
              </Td>
              <Td className="text-sm text-body">{lead.company_name || "—"}</Td>
              <Td className="hidden md:table-cell text-sm text-muted">
                {SOURCE_LABELS[lead.source] ?? lead.source}
              </Td>
              <Td>
                <StatusPill status={lead.status} />
              </Td>
              <Td>
                <ScoreBadge score={lead.score} />
              </Td>
              <Td className="hidden sm:table-cell text-xs text-faint">
                {formatRelative(lead.created_at)}
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}
