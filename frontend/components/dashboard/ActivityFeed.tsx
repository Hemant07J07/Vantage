"use client";

import { Activity as ActivityIcon } from "lucide-react";
import { EmptyState } from "@/components/ui";
import { useSearch } from "@/components/providers/SearchProvider";
import { cn } from "@/lib/cn";
import { formatRelative } from "@/lib/format";
import type { ActivityRow } from "@/lib/types";

const DOT_TONES: Record<string, string> = {
  high_intent: "bg-ok",
  nurture: "bg-accent",
  qualification_failed: "bg-danger",
  research_failed: "bg-danger",
  research_completed: "bg-info",
  research_started: "bg-info",
  assigned: "bg-warn",
  created: "bg-muted",
};

export function ActivityFeed({ rows }: { rows: ActivityRow[] }) {
  const { query } = useSearch();

  // Bounded by `?limit=` on the endpoint that fed this (8 on Overview, 100 on
  // the dedicated Activity page) rather than real pagination, so there's no
  // hidden second page a client-only filter could miss — filtering what's
  // already here is the honest option, not a shortcut.
  const visible = query
    ? rows.filter(
        (row) =>
          (row.company_name ?? "").toLowerCase().includes(query.toLowerCase()) ||
          row.label.toLowerCase().includes(query.toLowerCase()) ||
          (row.description ?? "").toLowerCase().includes(query.toLowerCase())
      )
    : rows;

  if (rows.length === 0) {
    return (
      <EmptyState
        compact
        icon={ActivityIcon}
        title="No activity yet"
        body="Events appear here as leads are qualified and accounts researched."
      />
    );
  }

  if (visible.length === 0) {
    return (
      <EmptyState
        compact
        icon={ActivityIcon}
        title="No activity matches your search"
        body={`Nothing here mentions "${query}".`}
      />
    );
  }

  // Real rows only — a short feed is padded with nothing.
  return (
    <ul className="space-y-3">
      {visible.map((row) => (
        <li key={row.id} className="flex gap-2.5">
          <span
            className={cn(
              "mt-1.5 w-1.5 h-1.5 rounded-full shrink-0",
              DOT_TONES[row.type] ?? "bg-muted"
            )}
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-body leading-snug">
              {row.company_name && (
                <span className="text-hi">{row.company_name} </span>
              )}
              <span className="text-muted">{row.label}</span>
            </p>
            {row.description && (
              <p className="text-xs text-faint truncate">{row.description}</p>
            )}
          </div>
          <span className="text-[11px] text-faint shrink-0">
            {formatRelative(row.created_at)}
          </span>
        </li>
      ))}
    </ul>
  );
}
