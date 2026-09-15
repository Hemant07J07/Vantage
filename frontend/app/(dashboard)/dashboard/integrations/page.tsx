"use client";

import { Badge, Card, CardBody, CardHeader, CardTitle, EmptyState } from "@/components/ui";
import { OllamaConnection } from "@/components/dashboard/OllamaConnection";
import { useSearch } from "@/components/providers/SearchProvider";
import { Plug } from "lucide-react";

/**
 * Connectors that don't exist yet.
 *
 * Rendered as flat, clearly-unavailable tiles rather than as toggles. A
 * switch implies it can be flipped; there is no OAuth flow, no webhook
 * receiver and no API-key model behind any of these, so a toggle here would
 * be a control that does nothing pretending to be one that does.
 */
const PLANNED = [
  {
    name: "HubSpot",
    kind: "CRM",
    description:
      "Push qualified accounts across with their evidence trail attached, and read deal stages back.",
  },
  {
    name: "Salesforce",
    kind: "CRM",
    description:
      "Two-way sync of accounts, contacts and stage changes.",
  },
  {
    name: "Slack",
    kind: "Notifications",
    description:
      "Post to a channel when an account crosses your intent threshold.",
  },
  {
    name: "Gmail / Outlook",
    kind: "Outreach",
    description:
      "Send drafted outreach from your own mailbox and track replies back to the account.",
  },
  {
    name: "Webhooks",
    kind: "Developer",
    description:
      "Every completed research run delivered as a signed JSON payload.",
  },
  {
    name: "API keys",
    kind: "Developer",
    description:
      "Run research and read briefs programmatically.",
  },
];

// A Client Component so the static tile list can be filtered by the shared
// search box — this page has no data fetch, so the conversion costs nothing
// (no `dynamic = "force-dynamic"` to reconcile; that config only applies to
// Server Components anyway).
export default function IntegrationsPage() {
  const { query } = useSearch();

  const visible = query
    ? PLANNED.filter(
        (item) =>
          item.name.toLowerCase().includes(query.toLowerCase()) ||
          item.kind.toLowerCase().includes(query.toLowerCase()) ||
          item.description.toLowerCase().includes(query.toLowerCase())
      )
    : PLANNED;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-[32px] font-semibold tracking-tight text-hi">
          Integrations
        </h1>
        <p className="mt-1.5 text-[15px] text-muted">
          What Vantage is connected to.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_2fr] items-start">
        <Card>
          <CardHeader>
            {/* No count here: whether this one is actually up is reported by
                the tile itself, live. A static "1 active" would keep claiming
                a working connection through an outage. */}
            <CardTitle>Connected</CardTitle>
          </CardHeader>
          <CardBody>
            <OllamaConnection />
          </CardBody>
        </Card>

        <Card variant="solid">
          <CardHeader>
            <div>
              <CardTitle>Planned</CardTitle>
              <p className="text-xs text-muted mt-1">
                None of these are built — no connector backend exists yet
              </p>
            </div>
          </CardHeader>
          <CardBody>
            {visible.length === 0 ? (
              <EmptyState
                icon={Plug}
                title="No connectors match your search"
                body={`Nothing planned mentions "${query}".`}
              />
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {visible.map((item) => (
                  <li
                    key={item.name}
                    className="rounded-xl border border-line bg-white/[0.02] p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-body truncate">
                          {item.name}
                        </p>
                        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
                          {item.kind}
                        </p>
                      </div>
                      <Badge tone="neutral" variant="pill">
                        Planned
                      </Badge>
                    </div>
                    <p className="mt-2.5 text-xs leading-relaxed text-muted text-pretty">
                      {item.description}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
