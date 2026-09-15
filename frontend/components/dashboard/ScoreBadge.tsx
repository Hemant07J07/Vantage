import { Badge } from "@/components/ui";
import { SCORE_HIGH, SCORE_MEDIUM } from "@/lib/constants";
import type { LeadScore } from "@/lib/types";

export function ScoreBadge({ score }: { score: LeadScore | null }) {
  if (!score) {
    return (
      <Badge tone="neutral" dot>
        scoring…
      </Badge>
    );
  }
  const tone =
    score.total_score >= SCORE_HIGH
      ? "ok"
      : score.total_score >= SCORE_MEDIUM
        ? "accent"
        : "neutral";
  return (
    <Badge tone={tone} className="font-mono tabular">
      {score.total_score}
    </Badge>
  );
}
