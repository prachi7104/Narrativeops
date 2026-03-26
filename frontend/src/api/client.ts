export const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

import type {
  AuditEvent,
  CorrectionsSummaryResponse,
  DashboardSummary,
  DiffResponse,
  EngagementStrategyResponse,
  PipelineMetrics,
  PipelineOutput,
  PipelineRun,
  RunSummary,
  SettingsRulesResponse,
  StyleMemoryResponse,
  UploadGuideResponse,
} from "./types";

async function assertOk(response: Response, endpoint: string): Promise<void> {
  if (response.ok) {
    return;
  }
  const body = await response.text().catch(() => "");
  throw new Error(
    `Request to ${endpoint} failed with HTTP ${response.status}${body ? `: ${body}` : ""}`,
  );
}

function isNotFound(response: Response): boolean {
  return response.status === 404;
}

export async function startPipeline(
  brief: { topic: string; description: string; content_domain?: string; content_category?: string; output_options?: string[]; tone?: string; target_languages?: string[] },
  sessionId?: string,
  engagementData?: Record<string, unknown> | null,
): Promise<{ run_id: string; status: string }> {
  const endpoint = `${BASE_URL}/api/pipeline/run`;
  const payloadBrief: Record<string, unknown> = { ...brief };
  if (sessionId) {
    payloadBrief.session_id = sessionId;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      brief: payloadBrief,
      engagement_data: engagementData ?? null,
    }),
  });

  await assertOk(response, endpoint);
  return (await response.json()) as { run_id: string; status: string };
}

export async function uploadBrandGuide(
  file: File,
  sessionId: string,
): Promise<UploadGuideResponse> {
  const endpoint = `${BASE_URL}/api/upload-guide`;
  const formData = new FormData();
  formData.append("file", file);
  formData.append("session_id", sessionId);

  const response = await fetch(endpoint, {
    method: "POST",
    body: formData,
  });

  await assertOk(response, endpoint);
  return (await response.json()) as UploadGuideResponse;
}

export async function approvePipeline(runId: string): Promise<{ status: string }> {
  const endpoint = `${BASE_URL}/api/pipeline/${runId}/approve`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ approved: true }),
  });

  await assertOk(response, endpoint);
  return (await response.json()) as { status: string };
}

export async function rejectPipeline(runId: string, rejectionReason = ""): Promise<{ status: string }> {
  const endpoint = `${BASE_URL}/api/pipeline/${runId}/approve`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ approved: false, rejection_reason: rejectionReason }),
  });

  await assertOk(response, endpoint);
  return (await response.json()) as { status: string };
}

export async function cancelPipeline(runId: string): Promise<void> {
  const endpoint = `${BASE_URL}/api/pipeline/${runId}/cancel`;
  const response = await fetch(endpoint, { method: "POST" });
  await assertOk(response, endpoint);
}

export async function getOutputs(runId: string): Promise<PipelineOutput[]> {
  const endpoint = `${BASE_URL}/api/pipeline/${runId}/outputs`;
  const response = await fetch(endpoint);

  await assertOk(response, endpoint);
  const data = (await response.json()) as { outputs: PipelineOutput[] };
  return data.outputs;
}

export async function captureDiff(
  runId: string,
  channel: string,
  language: string,
  originalText: string,
  correctedText: string,
  category: string,
): Promise<DiffResponse> {
  const endpoint = `${BASE_URL}/api/pipeline/${runId}/diff`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      channel,
      language,
      original_text: originalText,
      corrected_text: correctedText,
      content_category: category,
    }),
  });

  await assertOk(response, endpoint);
  return (await response.json()) as DiffResponse;
}

export async function getMetrics(runId: string): Promise<PipelineMetrics> {
  const endpoint = `${BASE_URL}/api/pipeline/${runId}/metrics`;
  const response = await fetch(endpoint);

  await assertOk(response, endpoint);
  return (await response.json()) as PipelineMetrics;
}

export async function getAuditTrail(runId: string): Promise<AuditEvent[]> {
  const endpoint = `${BASE_URL}/api/pipeline/${runId}/audit`;
  const response = await fetch(endpoint);

  await assertOk(response, endpoint);
  const data = (await response.json()) as { events: AuditEvent[] };
  return data.events;
}

export async function getPipelineStrategy(runId: string): Promise<EngagementStrategyResponse> {
  const endpoint = `${BASE_URL}/api/pipeline/${runId}/strategy`;
  const response = await fetch(endpoint);
  await assertOk(response, endpoint);
  return (await response.json()) as EngagementStrategyResponse;
}

export function getAuditPdfUrl(runId: string): string {
  return `${BASE_URL}/api/pipeline/${runId}/audit/pdf`;
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const endpoint = `${BASE_URL}/api/dashboard/summary`;
  const response = await fetch(endpoint);

  await assertOk(response, endpoint);
  return (await response.json()) as DashboardSummary;
}

export async function getRecentRuns(): Promise<PipelineRun[]> {
  const endpoint = `${BASE_URL}/api/dashboard/summary`;
  const response = await fetch(endpoint);
  await assertOk(response, endpoint);
  const data = (await response.json()) as { most_recent_runs: PipelineRun[] };
  return data.most_recent_runs || [];
}

export async function listRuns(limit = 20, status = "all"): Promise<RunSummary[]> {
  const endpoint = `${BASE_URL}/api/pipeline/runs?limit=${limit}&status=${encodeURIComponent(status)}`;
  const response = await fetch(endpoint);

  if (isNotFound(response)) {
    const summaryResponse = await fetch(`${BASE_URL}/api/dashboard/summary`);
    await assertOk(summaryResponse, `${BASE_URL}/api/dashboard/summary`);
    const summary = (await summaryResponse.json()) as DashboardSummary;
    const fallbackRuns = (summary.most_recent_runs || []).map((run) => ({
      id: run.id,
      brief_topic: run.brief_topic,
      status: run.status,
      created_at: run.created_at,
      output_options: ["blog", "twitter", "linkedin", "whatsapp"],
      compliance_verdict: run.status === "completed" ? "PASS" : "PENDING",
      has_hindi: false,
    }));
    return fallbackRuns.slice(0, limit);
  }

  await assertOk(response, endpoint);
  const data = (await response.json()) as { runs: RunSummary[] };
  return data.runs || [];
}

export async function getSettingsRules(): Promise<SettingsRulesResponse> {
  const endpoint = `${BASE_URL}/api/settings/rules`;
  const response = await fetch(endpoint);
  if (isNotFound(response)) {
    return { rules: [], count: 0, source: "unavailable" };
  }
  await assertOk(response, endpoint);
  return (await response.json()) as SettingsRulesResponse;
}

export async function reloadSettingsRules(): Promise<{ status: string; count: number; source: string }> {
  const endpoint = `${BASE_URL}/api/settings/rules/reload`;
  const response = await fetch(endpoint, { method: "POST" });
  if (isNotFound(response)) {
    return { status: "unavailable", count: 0, source: "unavailable" };
  }
  await assertOk(response, endpoint);
  return (await response.json()) as { status: string; count: number; source: string };
}

export async function getCorrectionsSummary(): Promise<CorrectionsSummaryResponse> {
  const endpoint = `${BASE_URL}/api/settings/corrections-summary`;
  const response = await fetch(endpoint);
  if (isNotFound(response)) {
    return { summary: [], total: 0 };
  }
  await assertOk(response, endpoint);
  return (await response.json()) as CorrectionsSummaryResponse;
}

export async function getStyleMemory(limit = 20): Promise<StyleMemoryResponse> {
  const endpoint = `${BASE_URL}/api/memory?limit=${limit}`;
  const response = await fetch(endpoint);
  if (isNotFound(response)) {
    return { by_category: {}, total: 0, categories: [] };
  }
  await assertOk(response, endpoint);
  return (await response.json()) as StyleMemoryResponse;
}

export async function getHealth(): Promise<{ status: string; version: string }> {
  const endpoint = `${BASE_URL}/health`;
  const response = await fetch(endpoint);
  await assertOk(response, endpoint);
  return (await response.json()) as { status: string; version: string };
}

export async function submitFeedback(
  runId: string,
  rating: number,
  comment: string,
  channel: string,
): Promise<{ status: string }> {
  const endpoint = `${BASE_URL}/api/pipeline/${runId}/feedback`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      rating,
      comment,
      channel,
    }),
  });

  await assertOk(response, endpoint);
  return (await response.json()) as { status: string };
}
