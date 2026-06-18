// DriftLens - All TypeScript types and interfaces
// This file is the single source of truth for all data shapes in the system.

// ─── Correction Records ───────────────────────────────────────────────────────

export interface StruggleChainTurn {
  role: 'developer' | 'ai';
  content: string;
  timestamp: string | null;
  files_modified: string[];
}

export interface StruggleChain {
  turn_count: number;
  total_turns: number;
  duration_seconds: number;
  friction_score: number;
  chain: StruggleChainTurn[];
  initial_request: string;
  final_committed_code: string | null;
  rules_extracted: string[];
}

export interface CorrectionRecord {
  id: string;
  ts: string;
  correction_type: 'git_delta' | 'reprompt' | 'struggle_chain' | 'churn';
  commit_hash: string | null;
  skill_active: string;
  file: string;
  language: string;

  // git_delta fields
  ai_wrote: string | null;
  human_committed: string | null;

  // reprompt fields
  developer_instruction: string | null;

  // struggle_chain fields
  struggle_chain: StruggleChain | null;

  // context
  context_before: string;
  context_after: string;

  // detection metadata
  detection_method: 'watch' | 'agent_hook' | 'session_log' | 'commit_tag' | 'co_author' | 'manual';
  detection_confidence: number;
  session_id: string | null;
  session_log_source: string | null;

  // agent metadata
  agent: 'copilot' | 'claude' | 'cursor' | 'gemini' | 'codex' | 'aider' | 'unknown';
  model_used: string;

  // NEW: Timing intelligence
  generation_timestamp: string | null;
  time_to_commit_ms: number | null;
  estimated_manual_time_ms: number | null;

  // NEW: Model version tracking
  model_version: string | null;
  agent_session_tokens: number | null;

  // NEW: Context classification
  module_category: string | null;
  pattern_categories: string[];
}

// ─── Pattern Records ──────────────────────────────────────────────────────────

export interface PatternRecord {
  pattern_id: string;
  name: string;
  description: string;
  occurrences: number;
  confidence: number;
  proposed_rule: string;
  example_before: string;
  example_after: string;
  target_skills: string[];
  target_formats: string[];
  source_correction_ids: string[];
  first_seen: string;
  last_seen: string;
  status: 'pending' | 'proposed' | 'merged' | 'rejected' | 'regressed';
  pr_url: string | null;
  drift_score_impact: number;

  // Struggle chain metadata
  avg_friction_score: number | null;
  total_prompt_turns_saved: number | null;
  constraint_block: string | null;

  // E-C1 reason taxonomy + E-A3 ranking (optional; populated by analyser)
  dominant_reason?: CorrectionReason;
  reason_breakdown?: Partial<Record<CorrectionReason, number>>;
  impact_score?: number;
}

// ─── Correction Reason Taxonomy (E-C1) ────────────────────────────────────────

export type CorrectionReason =
  | 'security'
  | 'correctness'
  | 'performance'
  | 'architecture'
  | 'style'
  | 'api-misuse'
  | 'naming'
  | 'testing'
  | 'other';

// ─── Feedback Records ─────────────────────────────────────────────────────────

export interface FeedbackRecord {
  pattern_id: string;
  proposed_at: string;
  pr_url: string;
  pr_status: 'merged' | 'closed' | 'open';
  merged_at: string | null;
  corrections_before_merge: number;
  corrections_after_merge: number;
  reduction_pct: number;
  regressed: boolean;
}

// ─── Session Records ──────────────────────────────────────────────────────────

export interface SessionRecord {
  session_id: string;
  start_ts: string;
  end_ts: string | null;
  source: 'watch' | 'copilot_hook' | 'session_log';
  agent: string;
}

// ─── Marked Commits ───────────────────────────────────────────────────────────

export interface MarkedCommitRecord {
  commit_hash: string;
  marked_at: string;
  method: 'manual';
}

// ─── Config ───────────────────────────────────────────────────────────────────

export interface SkillTarget {
  format: 'copilot' | 'claude' | 'cursor' | 'gemini' | 'windsurf' | 'codex' | 'universal';
  path: string;
}

export interface DetectionConfig {
  methods: string[];
  minConfidence: number;
  sessionLogWindowMinutes: number;
  fallbackTagPrefix: string;
  commitTagPatterns: string[];
}

export interface AnalysisConfig {
  minOccurrences: number;
  minConfidence: number;
  clusteringThreshold: number;
}

export interface LLMConfig {
  provider: 'anthropic' | 'openai' | 'gemini' | 'ollama';
  analysisModel: string;
  proposalModel: string;
  apiKey: string;
  baseUrl?: string;
}

export interface EmbeddingConfig {
  provider: 'voyage' | 'openai' | 'ollama';
  model: string;
  apiKey: string;
  baseUrl?: string;
}

export interface GitConfig {
  platform: 'github' | 'gitlab';
  token: string;
  owner?: string;
  repo?: string;
}

export interface DashboardConfig {
  port: number;
  openBrowser: boolean;
}

export interface DriftLensConfig {
  version: string;
  skillTargets: SkillTarget[];
  detection: DetectionConfig;
  analysis: AnalysisConfig;
  llm: LLMConfig;
  embeddings: EmbeddingConfig;
  git: GitConfig;
  dashboard: DashboardConfig;
}

// ─── LLM / Embedding Adapters (interfaces for adapters) ──────────────────────

export interface LLMAdapter {
  complete(
    prompt: string,
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<string>;
}

export interface EmbeddingAdapter {
  embed(texts: string[]): Promise<number[][]>;
}

// ─── Dashboard API response shapes ────────────────────────────────────────────

export interface OverviewResponse {
  drift_score: number;
  total_corrections: number;
  pattern_count: number;
  correction_breakdown: {
    git_delta: number;
    reprompt: number;
    struggle_chain: number;
    churn: number;
  };
  avg_friction: number;
  total_struggle_chains: number;
}

export interface HeatmapEntry {
  file: string;
  week: string;
  count: number;
}

export interface DriftScoreEntry {
  skill: string;
  score: number;
  trend: 'improving' | 'stable' | 'degrading';
}

export interface TimelineEntry {
  week: string;
  corrections: number;
  events: Array<{ type: string; label: string }>;
}

export interface AgentBreakdown {
  agent: string;
  correction_count: number;
  avg_friction: number;
  pct: number;
}

// ─── Detection result ─────────────────────────────────────────────────────────

export interface DetectionResult {
  commit_hash: string;
  is_ai_assisted: boolean;
  combined_confidence: number;
  signals: Array<{
    method: CorrectionRecord['detection_method'];
    confidence: number;
    agent?: string;
    session_id?: string;
    session_log_source?: string;
  }>;
}

// ─── INTELLIGENCE LAYER - Productivity Ledger ─────────────────────────────────

export interface ProductivityRecord {
  date: string;
  developer_id: string;
  agent: string;
  model_version: string;

  // Time accounting
  total_generation_events: number;
  total_time_saved_ms: number;
  total_correction_time_ms: number;
  net_productivity_ms: number;

  // Financial
  hourly_rate: number;
  dollar_value_generated: number;
  dollar_value_lost: number;
  net_roi_dollars: number;
  tool_cost_dollars: number;
  roi_multiplier: number;
}

export interface ProductivityLedger {
  period: string;
  records: ProductivityRecord[];
  summary: {
    total_time_saved_hours: number;
    total_time_lost_hours: number;
    net_hours: number;
    total_dollar_value: number;
    total_dollar_lost: number;
    net_roi: number;
    roi_multiplier: number;
    trend_vs_last_period: number;
  };
}

// ─── INTELLIGENCE LAYER - Agent Quality Matrix ────────────────────────────────

export interface AgentQualityRecord {
  agent: string;
  model_version: string;
  context_category: string;

  total_generations: number;
  total_corrections: number;
  accuracy_rate: number;
  avg_correction_time_ms: number;

  // Trend
  accuracy_7d: number;
  accuracy_30d: number;
  accuracy_trend: 'improving' | 'stable' | 'degrading';

  // Comparison
  rank_in_category: number;
  recommended: boolean;
}

export interface AgentQualityMatrix {
  agents: string[];
  categories: string[];
  scores: Record<string, Record<string, AgentQualityRecord>>;
  recommendations: AgentRecommendation[];
}

export interface AgentRecommendation {
  context_category: string;
  recommended_agent: string;
  accuracy: number;
  runner_up_agent: string;
  runner_up_accuracy: number;
  potential_time_saved_per_task_ms: number;
}

// ─── INTELLIGENCE LAYER - Failure Prediction ──────────────────────────────────

export interface FailurePrediction {
  file: string;
  predicted_failures: {
    pattern_id: string;
    pattern_name: string;
    probability: number;
    constraint_to_inject: string;
    historical_correction_count: number;
    last_occurred: string;
  }[];
  overall_risk: 'low' | 'medium' | 'high' | 'critical';
  recommended_agent: string | null;
}

export interface PreventionRecord {
  id: string;
  ts: string;
  file: string;
  predictions_injected: number;
  actual_corrections_after: number;
  predictions_accurate: number;
  corrections_prevented: number;
}

// ─── INTELLIGENCE LAYER - Model Regression Sentinel ───────────────────────────

export interface RegressionRecord {
  id: string;
  detected_at: string;
  agent: string;
  old_model_version: string;
  new_model_version: string;
  regressed_patterns: {
    pattern_id: string;
    pattern_name: string;
    correction_rate_before: number;
    correction_rate_after: number;
    increase_pct: number;
    severity: 'critical' | 'moderate' | 'minor';
  }[];
  total_patterns_checked: number;
  total_regressed: number;
}

// ─── INTELLIGENCE LAYER - Context Economics ───────────────────────────────────

export interface RuleEconomics {
  rule_id: string;
  rule_text: string;
  source_file: string;
  token_count: number;

  // Cost
  sessions_per_month: number;
  tokens_consumed_per_month: number;
  dollar_cost_per_month: number;

  // Value
  corrections_prevented_per_month: number;
  avg_correction_time_ms: number;
  dollar_value_per_month: number;

  // ROI
  roi_multiplier: number;
  status: 'high-value' | 'positive' | 'marginal' | 'dead-weight';
  recommendation: 'keep' | 'strengthen' | 'archive' | 'rewrite';
}

// ─── INTELLIGENCE LAYER - Cross-Agent Unification ─────────────────────────────

export interface UnificationAudit {
  conflicts: {
    rule_a: { file: string; text: string; agent: string };
    rule_b: { file: string; text: string; agent: string };
    severity: 'critical' | 'warning' | 'info';
    recommendation: string;
  }[];
  coverage_gaps: {
    rule_text: string;
    present_in: string[];
    missing_from: string[];
    recommendation: string;
  }[];
  staleness: {
    file: string;
    agent: string;
    last_updated: string;
    days_stale: number;
    active_rules: number;
  }[];
}

// ─── INTELLIGENCE LAYER - Organizational Maturity Score ───────────────────────

export interface MaturityScore {
  overall: number;
  breakdown: {
    skill_coverage: number;
    correction_rate: number;
    agent_utilization: number;
    time_to_fix: number;
    regression_rate: number;
    rule_freshness: number;
    team_consistency: number;
  };
  percentile: number;
  trend: 'improving' | 'stable' | 'degrading';
  next_actions: string[];
}

// ─── Config Extension ─────────────────────────────────────────────────────────

export interface IntelligenceConfig {
  hourlyRate: number;
  toolCostPerMonth: number;
  sessionsPerDay: number;
  enablePrediction: boolean;
  enableRegression: boolean;
  mcpServerPort: number;
}

export interface DriftLensConfigV3 extends DriftLensConfig {
  intelligence: IntelligenceConfig;
}

// ─── Rule Effectiveness Ledger (E-F1 / NF-2) ──────────────────────────────────

export type RuleHealth = 'high-value' | 'positive' | 'marginal' | 'dead-weight' | 'unproven';

export interface RuleLedgerEntry {
  pattern_id: string;
  name: string;
  status: PatternRecord['status'];
  dominant_reason: CorrectionReason | null;

  // Effectiveness (causal, before/after merge)
  merged_at: string | null;
  window_days: number;
  corrections_before: number;
  corrections_after: number;
  reduction_pct: number;
  low_confidence: boolean;

  // Economics (per month)
  token_cost_per_month: number;
  prevented_per_month: number;
  dollar_saved_per_month: number;
  roi_multiplier: number;

  health: RuleHealth;
  recommendation: 'keep' | 'strengthen' | 'archive' | 'monitor';
  last_fired: string | null;
}

export interface RuleLedger {
  generated_at: string;
  window_days: number;
  entries: RuleLedgerEntry[];
  summary: {
    total_rules: number;
    proven_effective: number;
    dead_weight: number;
    total_dollar_saved_per_month: number;
    total_token_cost_per_month: number;
    net_roi_per_month: number;
  };
}

// ─── Proposal Provenance & Rejection Learning (E-F2 / E-P1) ───────────────────

export interface ProposalDecisionRecord {
  rule_hash: string;
  pattern_id: string;
  name: string;
  decision: 'proposed' | 'rejected' | 'merged' | 'superseded';
  reason: string | null;
  ts: string;
}

// ─── Meta-Patterns (E-A2) ─────────────────────────────────────────────────────

export interface MetaPattern {
  meta_id: string;
  theme: string;
  description: string;
  member_pattern_ids: string[];
  total_occurrences: number;
  dominant_reason: CorrectionReason | null;
  systemic_score: number;
}

// ─── Contradiction Detection (E-A5) ───────────────────────────────────────────

export interface Contradiction {
  contradiction_id: string;
  file_or_topic: string;
  side_a: { instruction: string; correction_ids: string[]; developers: string[] };
  side_b: { instruction: string; correction_ids: string[]; developers: string[] };
  severity: 'high' | 'medium' | 'low';
  recommendation: string;
}

// ─── Org Rule Registry (NF-3) ─────────────────────────────────────────────────

export interface RegistryRule {
  rule_id: string;
  name: string;
  rule_text: string;
  reason: CorrectionReason | null;
  confidence: number;
  occurrences: number;
  scope: 'org' | 'team' | 'repo';
  version: string;
  provenance: {
    source_repo: string | null;
    first_seen: string;
    last_seen: string;
    evidence_correction_count: number;
  };
}

export interface RuleRegistry {
  registry_version: string;
  exported_at: string;
  source: string;
  scope: 'org' | 'team' | 'repo';
  rules: RegistryRule[];
}

// ─── Correction-to-Test Synthesis (NF-4) ──────────────────────────────────────

export interface SynthesizedTest {
  pattern_id: string;
  name: string;
  kind: 'semgrep' | 'eslint-note' | 'unit-test-stub';
  language: string;
  content: string;
  rationale: string;
}
