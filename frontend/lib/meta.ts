import "server-only";
import { cache } from "react";
import { backendFetchSafe } from "./api";
import {
  MIN_TREND_DAYS,
  MIN_TREND_POINTS,
  SCORE_HIGH,
  SCORE_MEDIUM,
} from "./constants";
import type { PipelineStage } from "./types";

export interface StageMeta {
  key: PipelineStage;
  label: string;
  description: string;
  /** Whether a person may move an account into this stage. */
  manual: boolean;
}

export interface ScoreBand {
  label: string;
  min: number;
  max: number;
}

export interface VocabularyEntry {
  key: string;
  label: string;
}

export interface Meta {
  thresholds: {
    high_intent_score: number;
    qualified_min_score: number;
    min_trend_points: number;
    min_trend_days: number;
    /** 0–1 ceiling applied to claims nothing backs up. */
    unsourced_confidence_cap: number;
  };
  pipeline_stages: StageMeta[];
  score_bands: ScoreBand[];
  signal_types: VocabularyEntry[];
  signal_strengths: VocabularyEntry[];
  source_kinds: VocabularyEntry[];
  buying_intents: VocabularyEntry[];
  lead_statuses: VocabularyEntry[];
  lead_sources: VocabularyEntry[];
  research_steps: VocabularyEntry[];
}

/**
 * Last-resort values, used only if `/analytics/meta/` itself is unreachable.
 *
 * These are not a second source of truth — they're what keeps a page
 * rendering when the endpoint is down, in the same spirit as
 * `backendFetchSafe`'s per-panel fallbacks. The stage list is empty on
 * purpose: inventing columns would be worse than showing none, because a
 * fabricated board implies accounts have been sorted into it.
 */
const FALLBACK: Meta = {
  thresholds: {
    high_intent_score: SCORE_HIGH,
    qualified_min_score: SCORE_MEDIUM,
    min_trend_points: MIN_TREND_POINTS,
    min_trend_days: MIN_TREND_DAYS,
    unsourced_confidence_cap: 0.4,
  },
  pipeline_stages: [],
  score_bands: [],
  signal_types: [],
  signal_strengths: [],
  source_kinds: [],
  buying_intents: [],
  lead_statuses: [],
  lead_sources: [],
  research_steps: [],
};

/**
 * Vocabularies and thresholds, read from the backend that enforces them.
 *
 * `cache()` dedupes this across a single render pass, so a page using it in
 * three places still makes one request.
 */
export const getMeta = cache(async (): Promise<Meta> => {
  return backendFetchSafe<Meta>("/analytics/meta/", FALLBACK);
});
