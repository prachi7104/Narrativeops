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
  estimated_hours_saved: number;
  time_saved_display: string;
  estimated_cost_saved_inr: number;
  cost_saved_display: string;
  compliance_iterations: number;
  corrections_applied: number;
  rules_checked: number;
  trend_sources_used: number;
  brand_rules_used: boolean;
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
  status: "running" | "awaiting_approval" | "completed" | "failed" | "escalated";
  created_at: string;
}

export interface DashboardSummary {
  total_runs: number;
  total_time_saved_hours: number;
  total_cost_saved_inr: number;
  total_corrections_captured: number;
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
  status: "running" | "awaiting_approval" | "completed" | "failed" | "escalated";
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
