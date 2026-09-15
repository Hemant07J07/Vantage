import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui";
import { backendFetchSafe } from "@/lib/api";
import type { AIHealth } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const health = await backendFetchSafe<AIHealth>("/ai/health/", {
    service_reachable: false,
    model_reachable: false,
    model: "",
    model_label: "",
    requests_today: 0,
    requests_limit: null,
  });

  const rows = [
    { label: "AI service", value: health.service_reachable ? "Reachable" : "Unreachable" },
    { label: "Model provider", value: health.model_reachable ? "Reachable" : "Unreachable" },
    { label: "Model", value: health.model_label || health.model || "—" },
    {
      label: "Model available",
      value: health.model_available == null ? "Unknown" : health.model_available ? "Yes" : "No",
    },
    { label: "Research runs today", value: String(health.requests_today) },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-[32px] font-semibold tracking-tight text-hi">Settings</h1>
        <p className="mt-1.5 text-[15px] text-muted">Environment and model configuration</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>AI service</CardTitle>
        </CardHeader>
        <CardBody>
          <dl className="space-y-2.5">
            {rows.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-3">
                <dt className="text-sm text-muted">{row.label}</dt>
                <dd className="text-sm text-body font-mono">{row.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-faint">
            The model is set with <span className="font-mono">GROQ_MODEL</span> in{" "}
            <span className="font-mono">ai-service/.env</span>. Everything shown here is read
            live from the service rather than hardcoded.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
