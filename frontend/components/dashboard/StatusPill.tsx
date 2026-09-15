import { Badge, type BadgeTone } from "@/components/ui";
import { STATUS_LABELS } from "@/lib/constants";
import type { LeadStatus } from "@/lib/types";

// `failed` and `high_intent` used to share a colour, so an urgent lead and a
// broken one looked identical at a glance. They're now distinct.
const TONES: Record<LeadStatus, BadgeTone> = {
  new: "neutral",
  qualifying: "info",
  high_intent: "ok",
  nurture: "accent",
  failed: "danger",
};

export function StatusPill({ status }: { status: LeadStatus }) {
  return (
    <Badge tone={TONES[status]} dot={status === "qualifying"}>
      {STATUS_LABELS[status] ?? status}
    </Badge>
  );
}
