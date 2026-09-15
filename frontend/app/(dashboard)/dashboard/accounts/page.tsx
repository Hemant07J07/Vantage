import Link from "next/link";
import { Building2, ChevronRight } from "lucide-react";
import { Avatar, Badge, Card, EmptyState, GaugeRing, Table, Td, Th, Tr } from "@/components/ui";
import { SearchSync } from "@/components/shell/SearchSync";
import { backendFetchSafe } from "@/lib/api";
import { formatRelative } from "@/lib/format";
import type { CompanyListItem, PaginatedResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>;
}) {
  const { search = "" } = await searchParams;
  const data = await backendFetchSafe<PaginatedResponse<CompanyListItem>>(
    `/companies/${search ? `?search=${encodeURIComponent(search)}` : ""}`,
    { count: 0, next: null, previous: null, results: [] }
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-[32px] font-semibold tracking-tight text-hi">Accounts</h1>
        <p className="mt-1.5 text-[15px] text-muted">
          {data.count} compan{data.count === 1 ? "y" : "ies"} · researched accounts ranked by fit
        </p>
      </div>

      <SearchSync />

      {data.results.length === 0 ? (
        <Card>
          <EmptyState
            icon={Building2}
            title={search ? "No accounts match your search" : "No accounts yet"}
            body={
              search
                ? `Nothing here mentions "${search}".`
                : "Companies appear here when a lead arrives or you research one."
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <thead className="border-b border-line">
              <tr>
                <Th>Company</Th>
                <Th>ICP Fit</Th>
                <Th className="hidden sm:table-cell">Intent</Th>
                <Th className="hidden md:table-cell">Leads</Th>
                <Th className="hidden lg:table-cell">Researched</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {data.results.map((account) => (
                <Tr key={account.id}>
                  <Td>
                    <Link href={`/dashboard/accounts/${account.id}`} className="flex items-center gap-2.5 group">
                      <Avatar name={account.name} size={30} />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5">
                          <span className="text-sm text-hi truncate group-hover:text-accent transition-colors">
                            {account.name}
                          </span>
                          {account.verified && <Badge tone="info">✓</Badge>}
                        </span>
                        <span className="block text-xs text-faint truncate">
                          {account.domain || account.industry || "—"}
                        </span>
                      </span>
                    </Link>
                  </Td>
                  <Td>
                    {account.intelligence ? (
                      <GaugeRing value={account.intelligence.icp_fit_score} size={34} />
                    ) : (
                      <span className="text-xs text-faint">Not researched</span>
                    )}
                  </Td>
                  <Td className="hidden sm:table-cell">
                    {account.intelligence ? (
                      <Badge
                        tone={
                          account.intelligence.buying_intent === "high" ? "ok"
                            : account.intelligence.buying_intent === "warm" ? "warn"
                            : "neutral"
                        }
                        className="capitalize"
                      >
                        {account.intelligence.buying_intent}
                      </Badge>
                    ) : (
                      <span className="text-xs text-faint">—</span>
                    )}
                  </Td>
                  <Td className="hidden md:table-cell text-sm font-mono tabular text-muted">
                    {account.lead_count}
                  </Td>
                  <Td className="hidden lg:table-cell text-xs text-faint">
                    {account.intelligence ? formatRelative(account.intelligence.computed_at) : "Never"}
                  </Td>
                  <Td><ChevronRight className="w-4 h-4 text-faint" /></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
