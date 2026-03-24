import { useEffect } from "react";

export const AGENT_ID_MAP: Record<string, string> = {
  intake_agent: "1",
  trend_agent: "2",
  draft_agent: "3",
  disclaimer_injector: "4",
  compliance_agent: "5",
  localization_agent: "6",
  format_agent: "7",
};

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

type AgentEventPayload = {
  pipeline_status: string;
  compliance_verdict?: string;
  compliance_iterations?: number;
  [key: string]: unknown;
};

type PipelineSSEEvent = {
  type: string;
  run_id?: string;
  message?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
};

export function usePipelineSSE(
  runId: string | null,
  onAgentUpdate: (agentName: string, eventData: Record<string, unknown>) => void,
  onHumanRequired: (runId: string) => void,
  onError: (message: string) => void,
): void {
  useEffect(() => {
    if (!runId) {
      return;
    }

    const eventSource = new EventSource(`${BASE_URL}/api/pipeline/${runId}/stream`);

    eventSource.onmessage = (rawEvent: MessageEvent<string>) => {
      let event: PipelineSSEEvent;
      try {
        event = JSON.parse(rawEvent.data) as PipelineSSEEvent;
      } catch {
        onError("Failed to parse pipeline stream event");
        eventSource.close();
        return;
      }

      if (event.type === "heartbeat") {
        return;
      }

      if (event.type === "error") {
        onError((event.message as string) || "Pipeline error");
        eventSource.close();
        return;
      }

      if (event.type === "human_required" || event.type === "pipeline_complete") {
        onHumanRequired((event.run_id as string) || runId);
        eventSource.close();
        return;
      }

      if (event.type === "update") {
        const data = event.data as Record<string, unknown> | undefined;
        if (data && typeof data === "object") {
          for (const [key, value] of Object.entries(data)) {
            if (value && typeof value === "object") {
              onAgentUpdate(key, value as AgentEventPayload);
            }
          }
        }
      }
    };

    eventSource.onerror = () => {
      onError("Pipeline stream connection failed");
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [runId, onAgentUpdate, onHumanRequired, onError]);
}
