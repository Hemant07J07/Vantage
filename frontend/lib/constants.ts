import type { DashboardSummary, LeadSource, LeadStatus, MetricSeries } from "./types";

/**
 * Values that were previously duplicated across components and drifted.
 * SOURCE_LABELS lived in two files; the score thresholds lived in two more.
 */

export const SOURCE_LABELS: Record<LeadSource, string> = {
  website: "Website",
  linkedin: "LinkedIn",
  csv: "CSV import",
  landing_page: "Landing page",
  whatsapp: "WhatsApp",
  manual: "Manual",
};

export const STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  qualifying: "Qualifying",
  high_intent: "High intent",
  nurture: "Nurture",
  failed: "Failed",
};

/**
 * ⚠️ Fallbacks, not the source of truth.
 *
 * The real values live in Django — `HIGH_INTENT_THRESHOLD`, `MIN_TREND_POINTS`
 * and `MIN_TREND_DAYS` in `config/settings.py`, all environment-configurable —
 * and are published through `/analytics/meta/`. Server components should read
 * them via `getMeta()` in `lib/meta.ts`.
 *
 * These constants exist for two cases only: colour bands in leaf presentation
 * components that take no props, and keeping a page rendering when the meta
 * endpoint is unreachable. Do not add new business thresholds here — raising
 * one in Django and forgetting the copy here is exactly the silent divergence
 * the meta endpoint was added to end.
 */
export const SCORE_HIGH = 75;
export const SCORE_MEDIUM = 50;
export const MIN_TREND_POINTS = 3;
export const MIN_TREND_DAYS = 7;

export const APP_VERSION = "1.0.0";

/**
 * Per-panel fallbacks for `backendFetchSafe`, so one failing analytics
 * endpoint degrades to an empty state instead of taking the page down.
 *
 * Note `delta_pct: null` and `has_enough_history: false` — a fallback must
 * claim nothing. Zeroes here would render as real measurements.
 */
export const EMPTY_METRIC: MetricSeries = {
  value: 0,
  period_value: 0,
  previous_value: null,
  delta_pct: null,
  series: [],
  has_enough_history: false,
};

export const EMPTY_SUMMARY: DashboardSummary = {
  range_days: 30,
  total_leads: EMPTY_METRIC,
  qualified_leads: EMPTY_METRIC,
  high_intent: EMPTY_METRIC,
  actions_pending: EMPTY_METRIC,
  avg_score: null,
  scored_lead_count: 0,
  score_distribution: {},
};
