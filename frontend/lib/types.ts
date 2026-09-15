export type LeadStatus = "new" | "qualifying" | "high_intent" | "nurture" | "failed";
export type LeadSource = "website" | "linkedin" | "csv" | "landing_page" | "whatsapp" | "manual";

export interface LeadScore {
  icp_fit_score: number;
  buying_intent: "high" | "medium" | "low" | "unknown";
  urgency: "high" | "medium" | "low" | "unknown";
  total_score: number;
  computed_at: string;
}

export interface AIQualification {
  pain_points: string[];
  recommended_service: string;
  recommended_action: string;
  ai_summary: string;
  research_notes: string;
  model_used: string;
  created_at: string;
}

export interface Activity {
  id: number;
  type: string;
  description: string;
  created_at: string;
}

export interface Company {
  id: number;
  name: string;
  website: string;
  industry: string;
  employee_count: number | null;
  created_at: string;
}

export interface AssignmentUser {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
}

export interface Assignment {
  user: AssignmentUser;
  assigned_at: string;
}

export interface LeadListItem {
  id: number;
  contact_name: string;
  email: string;
  company_name: string | null;
  source: LeadSource;
  status: LeadStatus;
  created_at: string;
  score: LeadScore | null;
}

export interface LeadDetail {
  id: number;
  contact_name: string;
  email: string;
  phone: string;
  message: string;
  source: LeadSource;
  status: LeadStatus;
  created_at: string;
  updated_at: string;
  company: Company | null;
  score: LeadScore | null;
  qualification: AIQualification | null;
  activity: Activity[];
  assignment: Assignment | null;
}

export interface AnalyticsSummary {
  total_leads: number;
  ai_qualified: number;
  high_intent: number;
  avg_score: number;
  score_distribution: Record<string, number>;
}

export interface SourceBreakdownRow {
  source: LeadSource;
  count: number;
  avg_score: number | null;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// ---------------------------------------------------------------------------
// Company intelligence / research
// These mirror backend/intelligence/serializers.py.
// ---------------------------------------------------------------------------

export type ResearchStatus = "queued" | "running" | "complete" | "failed";
export type StepState = "pending" | "active" | "done" | "failed";
export type BuyingIntent = "high" | "warm" | "medium" | "low" | "unknown";
export type SourceKind =
  | "website"
  | "news"
  | "linkedin"
  | "jobs"
  | "crunchbase"
  | "web";
export type ClaimCategory =
  | "profile"
  | "challenge"
  | "need"
  | "intent"
  | "icp"
  | "risk";
export type SignalType =
  | "funding"
  | "hiring"
  | "news"
  | "product"
  | "leadership"
  | "web";

export interface ResearchStep {
  key: string;
  label: string;
  state: StepState;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  detail: string;
}

export interface Source {
  id: number;
  url: string;
  title: string;
  snippet: string;
  kind: SourceKind;
  provider: string;
  hostname: string;
  fetched_at: string;
}

export interface ResearchClaim {
  id: number;
  text: string;
  category: ClaimCategory;
  confidence: number;
  /** True when nothing backed this up — the model inferred it. */
  unsourced: boolean;
  source_ids: number[];
}

export interface Signal {
  id: number;
  type: SignalType;
  /** Human-readable form of `type`, from the backend's own choices. */
  type_label: string;
  value: string;
  strength: "high" | "medium" | "low";
  strength_label: string;
  /** True when no page backs this up — the backend decides, not the client. */
  unsourced: boolean;
  detected_at: string | null;
  observed_at: string;
  source_ids: number[];
}

/**
 * A signal in the cross-company dashboard feed (`/analytics/signals/`).
 *
 * Carries its sources inline so a feed row can open the evidence drawer
 * without a second request.
 */
export interface FeedSignal extends Signal {
  company_id: number;
  company_name: string;
  company_domain: string | null;
  sources: Source[];
}

/**
 * Where an account sits in the pipeline.
 *
 * `new` / `researching` / `qualified` are derived by the research pipeline.
 * `engaged` and `won` are only ever set by a person — nothing in the system
 * observes a reply or a closed deal, so they can't be inferred.
 */
export type PipelineStage =
  | "new"
  | "researching"
  | "qualified"
  | "engaged"
  | "won";

// Which stages a person may set is NOT declared here: the backend publishes
// it via /analytics/meta/ (`pipeline_stages[].manual`), because it is a rule
// the API enforces rather than a fact the client gets to assert.

export interface RecommendedService {
  title: string;
  rationale: string;
}

export interface CompanyIntelligence {
  icp_fit_score: number;
  icp_fit_label: string;
  buying_intent: BuyingIntent;
  /** Null on a first run — render "First research", never "+0%". */
  intent_delta_pct: number | null;
  /** Null because engagement isn't tracked yet — render "Not tracked yet". */
  engagement_score: number | null;
  research_confidence: number;
  summary: string;
  current_challenge: string;
  potential_need: string;
  recommended_services: RecommendedService[];
  recommended_outreach: string;
  outreach_subject: string;
  stage: PipelineStage;
  last_signal_at: string | null;
  computed_at: string;
}

export interface CompanyBrief {
  id: number;
  name: string;
  domain: string | null;
  website: string;
  industry: string;
  employee_count: number | null;
  description: string;
  location: string;
  logo_url: string;
  verified: boolean;
}

export interface CompanyListItem {
  id: number;
  name: string;
  domain: string | null;
  industry: string;
  employee_count: number | null;
  location: string;
  verified: boolean;
  lead_count: number;
  intelligence: CompanyIntelligence | null;
}

export interface ResearchJob {
  id: string;
  status: ResearchStatus;
  current_step: string;
  steps: ResearchStep[];
  error: string;
  input_query: string;
  normalized_domain: string;
  model_used: string;
  duration_ms: number | null;
  created_at: string;
  finished_at: string | null;
  company: CompanyBrief | null;
  result: CompanyIntelligence | null;
  claims: ResearchClaim[];
  signals: Signal[];
  sources: Source[];
  /** Set by the create endpoint when returning an already-fresh result. */
  cached?: boolean;
}

export type WatchResult = "unreachable" | "unchanged" | "changed";

export interface MonitoringState {
  last_checked_at: string | null;
  last_changed_at: string | null;
  /** Empty until the first check has actually run. */
  last_result: WatchResult | "";
  last_reason: string;
  next_check_at: string;
}

export interface AccountDetail {
  company: CompanyBrief;
  intelligence: CompanyIntelligence | null;
  claims: ResearchClaim[];
  signals: Signal[];
  sources: Source[];
  /** Null when this account has never been checked by monitoring. */
  monitoring: MonitoringState | null;
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export interface SeriesPoint {
  date: string;
  value: number;
}

export interface MetricSeries {
  value: number;
  period_value: number;
  previous_value: number | null;
  /** Null when there's no prior period. The UI must render "—", not "+0%". */
  delta_pct: number | null;
  series: SeriesPoint[];
  /** False when a sparkline would be misleading. Required by chart props. */
  has_enough_history: boolean;
}

export interface DashboardSummary {
  range_days: number;
  total_leads: MetricSeries;
  qualified_leads: MetricSeries;
  high_intent: MetricSeries;
  actions_pending: MetricSeries;
  avg_score: number | null;
  scored_lead_count: number;
  score_distribution: Record<string, number>;
}

export interface IntentPoint {
  date: string;
  total: number;
  high_intent: number;
  avg_score: number;
}

export interface IntentOverTime {
  granularity: string;
  series: IntentPoint[];
  has_enough_history: boolean;
  min_points: number;
}

export interface IndustryRow {
  industry: string;
  count: number;
  avg_score: number | null;
  share_pct: number;
}

export interface TopIndustries {
  results: IndustryRow[];
  total_leads: number;
  /** False with fewer than two industries — a 100% bar at n=1 misleads. */
  show_shares: boolean;
}

export interface ActivityRow {
  id: number;
  type: string;
  label: string;
  description: string;
  lead_id: number | null;
  company_id: number | null;
  company_name: string | null;
  created_at: string;
}

export interface Insight {
  kind: string;
  tone: "ok" | "warn" | "info" | "danger";
  title: string;
  subtitle: string;
  href: string;
}

export interface AIHealth {
  service_reachable: boolean;
  model_reachable: boolean;
  model: string;
  model_label: string;
  model_available?: boolean;
  requests_today: number;
  /** Null when no quota is configured — show a bare count, not a fake "/5,000". */
  requests_limit: number | null;
}

export interface LeadCreateInput {
  contact_name: string;
  email: string;
  phone?: string;
  message?: string;
  source: LeadSource;
  company_name?: string;
  website?: string;
  industry?: string;
  employee_count?: number | null;
}

export interface CurrentUser {
  id: number;
  username: string;
  email: string;
  is_staff: boolean;
}
