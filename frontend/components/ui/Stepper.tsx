import { AlertCircle, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/format";
import type { ResearchStep } from "@/lib/types";

/**
 * Live progress for a research job.
 *
 * The states and timings come from the backend, which records each step as it
 * genuinely starts and finishes. Nothing here is on a timer — if a step takes
 * 40 seconds, the reader watches it take 40 seconds. That's the point: the
 * stepper is a window onto real work, not an animation played over a wait.
 */
export function Stepper({ steps }: { steps: ResearchStep[] }) {
  return (
    <ol className="space-y-1">
      {steps.map((step) => {
        const slow = step.state === "active" && isSlow(step);
        return (
          <li
            key={step.key}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors",
              step.state === "active" && "bg-raised"
            )}
          >
            <StepIcon state={step.state} />

            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "text-sm truncate",
                  step.state === "pending" && "text-faint",
                  step.state === "active" && "text-hi font-medium",
                  step.state === "done" && "text-body",
                  step.state === "failed" && "text-danger"
                )}
              >
                {step.label}
              </p>

              {step.state === "failed" && step.detail && (
                <p className="text-xs text-danger/80 mt-0.5 line-clamp-2">{step.detail}</p>
              )}
              {step.state === "done" && step.detail && (
                <p className="text-xs text-faint mt-0.5">{step.detail}</p>
              )}
              {slow && (
                <p className="text-xs text-muted mt-0.5">
                  Running a local model — the first request is slower while it warms up.
                </p>
              )}
            </div>

            {step.state === "done" && step.duration_ms != null && (
              <span className="text-[11px] font-mono tabular text-faint shrink-0">
                {formatDuration(step.duration_ms)}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** A step running for over half a minute needs explaining, not hiding. */
function isSlow(step: ResearchStep): boolean {
  if (!step.started_at) return false;
  return Date.now() - new Date(step.started_at).getTime() > 30_000;
}

function StepIcon({ state }: { state: ResearchStep["state"] }) {
  const base = "w-5 h-5 rounded-full flex items-center justify-center shrink-0";

  if (state === "done") {
    return (
      <span className={cn(base, "bg-ok-soft")}>
        <Check className="w-3 h-3 text-ok" />
      </span>
    );
  }
  if (state === "active") {
    return (
      <span className={cn(base, "bg-accent-soft")}>
        <Loader2 className="w-3 h-3 text-accent animate-spin" />
      </span>
    );
  }
  if (state === "failed") {
    return (
      <span className={cn(base, "bg-danger-soft")}>
        <AlertCircle className="w-3 h-3 text-danger" />
      </span>
    );
  }
  return (
    <span className={cn(base, "border border-line")}>
      <span className="w-1.5 h-1.5 rounded-full bg-faint" />
    </span>
  );
}
