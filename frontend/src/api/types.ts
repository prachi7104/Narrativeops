export interface PipelineOutput {
  channel:
    | "blog"
    | "faq"
    | "publisher_brief"
    | "op_ed"
    | "explainer_box"
    | "twitter"
    | "linkedin"
    | "whatsapp"
    | "article";
  language: "en" | "hi";
  content: string;
  approved: boolean;
}

export interface PipelineMetrics {
  run_id: string;
  total_duration_ms: number;
  total_duration_display: string;
  actual_duration_ms: number;
  actual_duration_display: string;
  baseline_manual_hours: number;
  baseline_breakdown?: Record<string, number>;
  estimated_hours_saved: number;
  time_saved_display: string;
  cycle_reduction_pct?: number;
  estimated_cost_saved_inr: number;
  cost_saved_display: string;
  estimated_llm_cost_usd?: number;
  cost_efficiency_ratio?: number;
  compliance_iterations: number;
  corrections_applied: number;
  rules_checked: number;
  trend_sources_used: number;
  brand_rules_used: boolean;
  rules_source_label?: string;
  agent_timing?: Array<{
    agent: string;
    action: string;
    duration_ms: number;
    verdict?: string | null;
  }>;
}

export interface DiffResponse {
  status: string;
  diff_summary: string;
  corrections_count: number;
}

export interface AuditEvent {
  agent_name: string;
  action: string;
  verdict: string | null;
  model_used: string | null;
  duration_ms: number | null;
  output_summary: string | null;
  created_at: string;
}

export interface ComplianceAnnotation {
  section?: string;
  sentence?: string;
  rule_id?: string;
  severity?: string;
  message?: string;
  suggested_fix?: string;
}

export interface ComplianceAuditSummary {
  format?: string;
  verdict?: string;
  summary?: string;
  annotations?: ComplianceAnnotation[];
}

export interface PipelineRun {
  id: string;
  brief_topic: string;
  status: "running" | "awaiting_approval" | "completed" | "failed" | "escalated" | "rejected";
  created_at: string;
}

export interface EngagementStrategyResponse {
  run_id: string;
  engagement_strategy: {
    recommendation?: string;
    top_channel?: string;
    underperforming_channel?: string;
    performance_ratio?: number;
    pivot_recommended?: boolean;
    pivot_reason?: string;
  };
  content_calendar: Array<{
    week: number;
    items: Array<{ format: string; topic: string; channel: string }>;
  }> | null;
  strategy_recommendation: string | null;
  pivot_recommended: boolean;
  pivot_reason: string | null;
}

export interface DashboardSummary {
  total_runs: number;
  total_time_saved_hours: number;
  total_cost_saved_inr: number;
  total_corrections_captured: number;
  avg_cycle_reduction_pct: number;
  most_recent_runs: PipelineRun[];
}

export interface OrgRule {
  rule_id: string;
  rule_text: string;
  category: string;
  severity: "error" | "warning";
  source: string;
}

export interface UploadGuideResponse {
  session_id: string;
  rules_extracted: number;
  preview: OrgRule[];
  error: string | null;
}

export interface RunSummary {
  id: string;
  brief_topic: string;
  status: "running" | "awaiting_approval" | "completed" | "failed" | "escalated" | "rejected";
  created_at: string;
  total_duration_ms?: number;
  compliance_iterations?: number;
  estimated_hours_saved?: number;
  estimated_cost_saved_inr?: number;
  trend_sources_used?: number;
  output_options?: string[];
  compliance_verdict?: string;
  has_hindi?: boolean;
}

export interface PipelineStatusResponse {
  run_id: string;
  status: "running" | "awaiting_approval" | "completed" | "failed" | "escalated" | "rejected" | "cancelled" | "unknown";
  pipeline_status: string;
  brief_json?: Record<string, unknown>;
}

export interface SettingsRule {
  rule_id: string;
  rule_text: string;
  category: string;
  severity: "error" | "warning";
  source: string;
}

export interface SettingsRulesResponse {
  rules: SettingsRule[];
  count: number;
  source: string;
}

export interface CorrectionsSummaryItem {
  category: string;
  count: number;
}

export interface CorrectionsSummaryResponse {
  summary: CorrectionsSummaryItem[];
  total: number;
}

export interface StyleMemoryResponse {
  by_category: Record<string, string[]>;
  total: number;
  categories: string[];
}
