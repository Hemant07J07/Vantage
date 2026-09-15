import { notFound } from "next/navigation";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { Button, Card, CardBody, Stepper } from "@/components/ui";
import { ResearchResult } from "@/components/research/ResearchResult";
import type { ResearchJob } from "@/lib/types";

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL || "http://backend:8000";

/**
 * Shareable permalink for a research run.
 *
 * Server-rendered so a completed brief can be linked to and read without
 * re-running anything — and so a job that outlives the tab that started it can
 * still be picked up here.
 */
export default async function ResearchPermalink({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;

  let job: ResearchJob;
  try {
    const res = await fetch(`${BACKEND_URL}/api/research/${jobId}/`, {
      cache: "no-store",
    });
    if (!res.ok) notFound();
    job = await res.json();
  } catch {
    notFound();
  }

  return (
    <div className="max-w-4xl mx-auto px-5 py-10">
      {job.status === "complete" ? (
        <ResearchResult job={job} />
      ) : job.status === "failed" ? (
        <Card className="border-danger/40">
          <CardBody className="space-y-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-danger mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-hi">
                  Research failed for {job.input_query}
                </p>
                <p className="mt-1 text-sm text-muted">{job.error}</p>
              </div>
            </div>
            <Stepper steps={job.steps} />
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardBody className="space-y-3">
            <p className="text-sm text-muted">
              Researching <span className="text-hi">{job.input_query}</span>…
            </p>
            <Stepper steps={job.steps} />
            <p className="text-xs text-faint">
              Refresh to see the latest progress.
            </p>
          </CardBody>
        </Card>
      )}

      <div className="mt-5">
        <Link href="/">
          <Button variant="secondary">Research another company</Button>
        </Link>
      </div>
    </div>
  );
}
