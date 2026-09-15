"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, RotateCcw, Search } from "lucide-react";
import { Button, Card, CardBody, Stepper } from "@/components/ui";
import { useResearchJob } from "@/hooks/useResearchJob";
import { ResearchResult } from "./ResearchResult";
import type { ResearchJob } from "@/lib/types";

/**
 * The product's front door: type a company, watch it get researched.
 *
 * The stepper shows backend-reported state, so the progress a visitor sees is
 * the actual pipeline advancing rather than an animation timed to look busy.
 */
export function ResearchLauncher({
  autoFocus = false,
  onComplete,
}: {
  autoFocus?: boolean;
  onComplete?: (job: ResearchJob) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [seed, setSeed] = useState<ResearchJob | null>(null);

  const { job, error: pollError } = useResearchJob(jobId, seed);
  const active = job ?? seed;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);
    setSubmitError(null);
    setSeed(null);
    setJobId(null);

    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed }),
      });
      const data = await res.json();

      if (!res.ok) {
        setSubmitError(
          res.status === 429
            ? "You've hit the research limit for this hour. Try again later."
            : data.detail || "Could not start research."
        );
        return;
      }

      setSeed(data as ResearchJob);
      // A cached result arrives already complete; nothing to poll for.
      if (data.status !== "complete" && data.status !== "failed") {
        setJobId(data.id);
      } else {
        onComplete?.(data);
      }
    } catch {
      setSubmitError("Could not reach the research service.");
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setQuery("");
    setSeed(null);
    setJobId(null);
    setSubmitError(null);
  }

  const running = active && active.status !== "complete" && active.status !== "failed";
  const complete = active?.status === "complete";
  const failed = active?.status === "failed";

  return (
    <div className="space-y-5">
      <form onSubmit={submit}>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-faint pointer-events-none" />
            <input
              autoFocus={autoFocus}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter a company name or website — e.g. stripe.com"
              aria-label="Company to research"
              className="w-full h-11 pl-10 pr-3 rounded-lg bg-surface border border-line text-sm text-hi placeholder:text-faint outline-none focus:border-accent transition-colors"
            />
          </div>
          <Button
            type="submit"
            variant="primary"
            loading={submitting}
            disabled={!query.trim()}
            className="h-11 px-5 shrink-0"
          >
            Research
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </form>

      {submitError && (
        <Card className="border-danger/40">
          <CardBody className="flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-danger mt-0.5 shrink-0" />
            <p className="text-sm text-body">{submitError}</p>
          </CardBody>
        </Card>
      )}

      {active && (running || failed) && (
        <Card>
          <CardBody>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-muted">
                Researching{" "}
                <span className="text-hi font-medium">
                  {active.company?.name || active.input_query}
                </span>
              </p>
              {failed && (
                <Button size="sm" variant="secondary" onClick={reset}>
                  <RotateCcw className="w-3.5 h-3.5" />
                  Try again
                </Button>
              )}
            </div>

            <Stepper steps={active.steps} />

            {/* The real reason, surfaced verbatim — "something went wrong"
                would hide whether the model provider is down or the domain
                has no data. */}
            {failed && active.error && (
              <div className="mt-3 px-3 py-2.5 rounded-lg bg-danger-soft">
                <p className="text-sm text-danger">{active.error}</p>
              </div>
            )}
            {pollError && !failed && (
              <p className="mt-3 text-sm text-warn">{pollError}</p>
            )}
          </CardBody>
        </Card>
      )}

      {complete && active && (
        <>
          <ResearchResult job={active} />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={() => router.push("/login")}>
              Save to dashboard
            </Button>
            <Button variant="secondary" onClick={reset}>
              Research another
            </Button>
            <a
              href={`/research/${active.id}`}
              className="text-sm text-muted hover:text-hi transition-colors ml-1"
            >
              Permalink
            </a>
          </div>
        </>
      )}
    </div>
  );
}
