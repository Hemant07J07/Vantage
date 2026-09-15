"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { Badge, EmptyState, Table, Td, Th, Tr } from "@/components/ui";
import { useSearch } from "@/components/providers/SearchProvider";
import { formatDuration, formatRelative } from "@/lib/format";
import type { ResearchJob } from "@/lib/types";

/**
 * Research's "Recent runs" table.
 *
 * `/research/history/` returns the last 50 jobs from a plain view, not a
 * DRF-paginated one — there's no second page hiding a match, so filtering
 * what's already loaded is the whole truth, not an approximation of it.
 */
export function ResearchHistoryTable({ jobs }: { jobs: ResearchJob[] }) {
  const { query } = useSearch();

  const visible = query
    ? jobs.filter((job) => {
        const subject = job.company?.name || job.input_query;
        return subject.toLowerCase().includes(query.toLowerCase());
      })
    : jobs;

  if (jobs.length === 0) {
    return (
      <EmptyState
        icon={Search}
        title="No research yet"
        body="Runs you start appear here with their status and timings."
      />
    );
  }

  if (visible.length === 0) {
    return (
      <EmptyState
        icon={Search}
        title="No runs match your search"
        body={`Nothing here mentions "${query}".`}
      />
    );
  }

  return (
    <Table>
      <thead className="border-b border-line">
        <tr>
          <Th>Company</Th>
          <Th>Status</Th>
          <Th className="hidden sm:table-cell">Model</Th>
          <Th className="hidden md:table-cell">Duration</Th>
          <Th>When</Th>
        </tr>
      </thead>
      <tbody>
        {visible.map((job) => (
          <Tr key={job.id}>
            <Td>
              <Link href={`/research/${job.id}`} className="text-sm text-hi hover:text-accent">
                {job.company?.name || job.input_query}
              </Link>
            </Td>
            <Td>
              <Badge
                tone={
                  job.status === "complete" ? "ok"
                    : job.status === "failed" ? "danger"
                    : "info"
                }
                dot={job.status === "running"}
              >
                {job.status}
              </Badge>
            </Td>
            <Td className="hidden sm:table-cell text-xs font-mono text-muted">
              {job.model_used || "—"}
            </Td>
            <Td className="hidden md:table-cell text-xs font-mono text-faint">
              {formatDuration(job.duration_ms) || "—"}
            </Td>
            <Td className="text-xs text-faint">{formatRelative(job.created_at)}</Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}
