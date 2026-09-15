"use client";

import Link from "next/link";
import { Building2, ChevronRight } from "lucide-react";
import { Avatar, Badge, EmptyState, GaugeRing, Table, Td, Th, Tr } from "@/components/ui";
import { useSearch } from "@/components/providers/SearchProvider";
import { formatRelative } from "@/lib/format";
import type { CompanyListItem } from "@/lib/types";

/**
 * Overview's "AI Priority Accounts" widget.
 *
 * `accounts` is already a top-5 teaser (`.slice(0, 5)` in the page), with its
 * own "View all" link to the real, fully-searchable Accounts page — so
 * filtering it locally over just those 5 rows isn't a new accuracy gap the
 * way it would be for a full paginated list. It was never a complete list to
 * begin with.
 */
export function PriorityAccountsList({ accounts }: { accounts: CompanyListItem[] }) {
  const { query } = useSearch();

  const visible = query
    ? accounts.filter(
        (a) =>
          a.name.toLowerCase().includes(query.toLowerCase()) ||
          (a.domain ?? "").toLowerCase().includes(query.toLowerCase()) ||
          (a.industry ?? "").toLowerCase().includes(query.toLowerCase())
      )
    : accounts;

  if (accounts.length === 0) {
    return (
      <EmptyState
        icon={Building2}
        title="No researched accounts yet"
        body="Research a company to see it ranked here by ICP fit."
      />
    );
  }

  if (visible.length === 0) {
    return (
      <EmptyState
        icon={Building2}
        title="No accounts match your search"
        body={`None of your top accounts mention "${query}" — try the full Accounts list.`}
      />
    );
  }

  return (
    <Table>
      <thead className="border-b border-line">
        <tr>
          <Th>Company</Th>
          <Th>ICP Fit</Th>
          <Th className="hidden sm:table-cell">Intent</Th>
          <Th className="hidden md:table-cell">Last research</Th>
          <Th />
        </tr>
      </thead>
      <tbody>
        {visible.map((account) => (
          <Tr key={account.id}>
            <Td>
              <Link
                href={`/dashboard/accounts/${account.id}`}
                className="flex items-center gap-2.5 group"
              >
                <Avatar name={account.name} size={28} />
                <span className="min-w-0">
                  <span className="block text-sm text-hi truncate group-hover:text-accent transition-colors">
                    {account.name}
                  </span>
                  <span className="block text-xs text-faint truncate">
                    {account.domain || account.industry || "—"}
                  </span>
                </span>
              </Link>
            </Td>
            <Td>
              <GaugeRing value={account.intelligence?.icp_fit_score ?? null} size={34} />
            </Td>
            <Td className="hidden sm:table-cell">
              <Badge
                tone={
                  account.intelligence?.buying_intent === "high"
                    ? "ok"
                    : account.intelligence?.buying_intent === "warm"
                      ? "warn"
                      : "neutral"
                }
                className="capitalize"
              >
                {account.intelligence?.buying_intent ?? "unknown"}
              </Badge>
            </Td>
            <Td className="hidden md:table-cell text-xs text-faint">
              {formatRelative(account.intelligence?.computed_at)}
            </Td>
            <Td>
              <ChevronRight className="w-4 h-4 text-faint" />
            </Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}
