import { FilterPill } from "@/components/ui";
import { LeadsTable } from "@/components/dashboard/LeadsTable";
import { SearchSync } from "@/components/shell/SearchSync";
import { backendFetchSafe } from "@/lib/api";
import type { LeadListItem, PaginatedResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

const FILTERS = [
  { value: "", label: "All" },
  { value: "new", label: "New" },
  { value: "qualifying", label: "Qualifying" },
  { value: "high_intent", label: "High intent" },
  { value: "nurture", label: "Nurture" },
  { value: "failed", label: "Failed" },
];

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; search?: string }>;
}) {
  const { status = "", search = "" } = await searchParams;

  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (search) params.set("search", search);
  const qs = params.toString();

  const data = await backendFetchSafe<PaginatedResponse<LeadListItem>>(
    `/leads/${qs ? `?${qs}` : ""}`,
    { count: 0, next: null, previous: null, results: [] }
  );

  // A status pill's href must carry the active search forward too, or
  // clicking one while a search is typed would silently drop it from the
  // URL — the box would still show the text, but the results wouldn't be
  // filtered by it anymore. SearchSync closes the same loop in the other
  // direction, merging into whatever `status` is already in the URL.
  function filterHref(value: string): string {
    const p = new URLSearchParams();
    if (value) p.set("status", value);
    if (search) p.set("search", search);
    const s = p.toString();
    return s ? `/dashboard/leads?${s}` : "/dashboard/leads";
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-[32px] font-semibold tracking-tight text-hi">Leads</h1>
        <p className="mt-1.5 text-[15px] text-muted">
          {data.count} lead{data.count === 1 ? "" : "s"} · qualified automatically on arrival
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((filter) => (
          <FilterPill
            key={filter.value}
            href={filterHref(filter.value)}
            active={status === filter.value}
          >
            {filter.label}
          </FilterPill>
        ))}
      </div>

      <SearchSync />
      <LeadsTable initialLeads={data.results} />
    </div>
  );
}
