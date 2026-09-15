"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ResearchJob } from "@/lib/types";

/**
 * Polls a research job until it finishes.
 *
 * Polling rather than a websocket, deliberately: the dashboard socket is a
 * single global authenticated broadcast group with no subscribe protocol, and
 * teaching it to fan per-job progress out to anonymous visitors is a lot of
 * machinery for one 2-minute job watched by one person. Polling also survives
 * a backend restart mid-job and needs no new infrastructure.
 */

const FAST_INTERVAL = 1500;
const SLOW_INTERVAL = 4000;
const SLOW_AFTER_MS = 60_000;

/**
 * Give up only when the job stops *progressing*, not when a stopwatch expires.
 *
 * This used to be a flat 240s ceiling, chosen when research was snippet-only
 * and finished in about two minutes. Once steps began reading the actual pages
 * behind their sources, real runs landed at 238s and 266s — so the UI declared
 * failure on jobs that then completed successfully seconds later, and threw
 * away a finished result.
 *
 * A wedged job and a slow one look different: a slow job keeps moving through
 * steps. So the stall timer resets on every observed change, and the absolute
 * ceiling sits above the backend's own Celery soft limit (1020s) — the client
 * must never be the first to give up, because the backend is the only side
 * that can actually report failure.
 */
const STALL_MS = 240_000;
const HARD_STOP_MS = 1_080_000;

export function useResearchJob(jobId: string | null, initial?: ResearchJob | null) {
  const [job, setJob] = useState<ResearchJob | null>(initial ?? null);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef<number>(Date.now());
  // When we last saw the job actually move, and what it looked like then.
  const progressAtRef = useRef<number>(Date.now());
  const fingerprintRef = useRef<string>("");

  const done = job?.status === "complete" || job?.status === "failed";

  const poll = useCallback(async (id: string) => {
    const res = await fetch(`/api/research/${id}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Poll failed (${res.status})`);
    return (await res.json()) as ResearchJob;
  }, []);

  useEffect(() => {
    if (!jobId || done) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    startedRef.current = Date.now();
    progressAtRef.current = Date.now();
    fingerprintRef.current = "";

    async function tick() {
      if (cancelled || !jobId) return;

      const elapsed = Date.now() - startedRef.current;
      const stalled = Date.now() - progressAtRef.current;

      if (stalled > STALL_MS || elapsed > HARD_STOP_MS) {
        // Deliberately does not say "try again": the job is still queued or
        // running server-side, and its permalink keeps updating. Telling
        // someone to retry would start a second run of a job that is very
        // likely about to finish.
        setError(
          "Still working — this is taking longer than usual. The result will " +
            "appear on this page when it's ready."
        );
        return;
      }

      try {
        const next = await poll(jobId);
        if (cancelled) return;

        // Any movement through the steps counts as progress and buys more time.
        const fingerprint = `${next.status}:${next.current_step}:${next.steps
          .map((s) => s.state)
          .join("")}`;
        if (fingerprint !== fingerprintRef.current) {
          fingerprintRef.current = fingerprint;
          progressAtRef.current = Date.now();
        }

        setJob(next);
        setError(null);
        if (next.status === "complete" || next.status === "failed") return;
      } catch (err) {
        if (cancelled) return;
        // A single failed poll is usually a blip; keep trying until the hard stop.
        console.error(err);
      }

      timer = setTimeout(tick, elapsed > SLOW_AFTER_MS ? SLOW_INTERVAL : FAST_INTERVAL);
    }

    timer = setTimeout(tick, FAST_INTERVAL);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [jobId, done, poll]);

  return { job, setJob, error, done };
}
