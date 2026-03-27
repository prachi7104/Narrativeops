import { useEffect, useRef } from "react";
import { getPipelineStatus } from "../api/client";

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
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAYS_MS = [1000, 2000, 4000];
const STATUS_POLL_INTERVAL_MS = 2500;

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
  onComplete?: (runId: string) => void,
): void {
  const onAgentUpdateRef = useRef(onAgentUpdate);
  const onHumanRequiredRef = useRef(onHumanRequired);
  const onErrorRef = useRef(onError);
  const onCompleteRef = useRef(onComplete);

  onAgentUpdateRef.current = onAgentUpdate;
  onHumanRequiredRef.current = onHumanRequired;
  onErrorRef.current = onError;
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (!runId) {
      return;
    }

    let eventSource: EventSource | null = null;
    let isDisposed = false;
    let reconnectAttempts = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let statusPollTimer: ReturnType<typeof setInterval> | null = null;

    const stopStatusPolling = () => {
      if (statusPollTimer) {
        clearInterval(statusPollTimer);
        statusPollTimer = null;
      }
    };

    const stopStream = () => {
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
    };

    const handleTerminalFromStatus = async () => {
      try {
        const status = await getPipelineStatus(runId);
        const normalized = String(status.status || "").toLowerCase();

        if (normalized === "awaiting_approval") {
          stopStatusPolling();
          onHumanRequiredRef.current(runId);
          return;
        }

        if (normalized === "completed") {
          stopStatusPolling();
          if (onCompleteRef.current) {
            onCompleteRef.current(runId);
          }
          return;
        }

        if (normalized === "failed" || normalized === "escalated" || normalized === "rejected" || normalized === "cancelled") {
          stopStatusPolling();
          onErrorRef.current(`Pipeline ${normalized}`);
        }
      } catch {
        // Keep polling until we can fetch terminal status.
      }
    };

    const startStatusPolling = () => {
      if (statusPollTimer) {
        return;
      }
      statusPollTimer = setInterval(() => {
        if (!isDisposed) {
          void handleTerminalFromStatus();
        }
      }, STATUS_POLL_INTERVAL_MS);
      void handleTerminalFromStatus();
    };

    const scheduleReconnect = () => {
      if (isDisposed) {
        return;
      }

      if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        startStatusPolling();
        return;
      }

      const delay = RECONNECT_DELAYS_MS[Math.min(reconnectAttempts, RECONNECT_DELAYS_MS.length - 1)];
      reconnectAttempts += 1;
      reconnectTimer = setTimeout(() => {
        if (!isDisposed) {
          connect();
        }
      }, delay);
    };

    const connect = () => {
      stopStream();
      eventSource = new EventSource(`${BASE_URL}/api/pipeline/${runId}/stream`);

      eventSource.onopen = () => {
        reconnectAttempts = 0;
        stopStatusPolling();
      };

      eventSource.onmessage = (rawEvent: MessageEvent<string>) => {
        let event: PipelineSSEEvent;
        try {
          event = JSON.parse(rawEvent.data) as PipelineSSEEvent;
        } catch {
          onErrorRef.current("Failed to parse pipeline stream event");
          stopStream();
          scheduleReconnect();
          return;
        }

        if (event.type === "heartbeat") {
          return;
        }

        if (event.type === "error") {
          onErrorRef.current((event.message as string) || "Pipeline error");
          stopStream();
          return;
        }

        if (event.type === "human_required") {
          onHumanRequiredRef.current((event.run_id as string) || runId);
          stopStream();
          return;
        }

        if (event.type === "pipeline_complete") {
          stopStream();
          if (onCompleteRef.current) {
            onCompleteRef.current((event.run_id as string) || runId);
          }
          return;
        }

        if (event.type === "update") {
          const data = event.data as Record<string, unknown> | undefined;
          if (data && typeof data === "object") {
            for (const [key, value] of Object.entries(data)) {
              if (value && typeof value === "object") {
                onAgentUpdateRef.current(key, value as AgentEventPayload);
              }
            }
          }
        }
      };

      eventSource.onerror = () => {
        stopStream();
        scheduleReconnect();
      };
    };

    connect();

    return () => {
      isDisposed = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      stopStatusPolling();
      stopStream();
    };
  }, [runId]);
}
