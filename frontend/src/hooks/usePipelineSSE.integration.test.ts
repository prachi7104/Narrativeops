/**
 * Integration tests for usePipelineSSE hook - Phase 1 bug fixes validation
 * Tests for B2+B5: SSE event format fix
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePipelineSSE } from './usePipelineSSE';

class MockEventSource {
  static instances: MockEventSource[] = [];

  public onmessage: ((event: MessageEvent) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;
  public closed = false;

  constructor(public url: string) {
    MockEventSource.instances.push(this);
  }

  close() {
    this.closed = true;
  }
}

describe('usePipelineSSE - Phase 1 Bug Fixes', () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    vi.stubGlobal('EventSource', MockEventSource as unknown as typeof EventSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // B2+B5: Test SSE event format with data field
  it('handles new SSE format with data field containing agent updates', () => {
    const onAgentUpdate = vi.fn();
    const onHumanRequired = vi.fn();
    const onError = vi.fn();

    renderHook(() => usePipelineSSE('run-123', onAgentUpdate, onHumanRequired, onError));

    const es = MockEventSource.instances[0];

    // New format: agent updates nested under 'data' key
    es.onmessage?.({
      data: JSON.stringify({
        type: 'update',
        run_id: 'run-123',
        data: {
          intake_agent: { pipeline_status: 'intake_complete', brief: { topic: 'Test' } },
          draft_agent: { pipeline_status: 'draft_complete', draft: 'Content here' },
        },
      }),
    } as MessageEvent);

    // Should call onAgentUpdate for each agent in data
    expect(onAgentUpdate).toHaveBeenCalledTimes(2);
    expect(onAgentUpdate).toHaveBeenCalledWith('intake_agent', {
      pipeline_status: 'intake_complete',
      brief: { topic: 'Test' },
    });
    expect(onAgentUpdate).toHaveBeenCalledWith('draft_agent', {
      pipeline_status: 'draft_complete',
      draft: 'Content here',
    });
  });

  it('ignores non-agent keys in top-level event (type, run_id, message)', () => {
    const onAgentUpdate = vi.fn();
    const onHumanRequired = vi.fn();
    const onError = vi.fn();

    renderHook(() => usePipelineSSE('run-123', onAgentUpdate, onHumanRequired, onError));

    const es = MockEventSource.instances[0];

    // Old buggy behavior would try to process 'type', 'run_id', 'message' as agent names
    es.onmessage?.({
      data: JSON.stringify({
        type: 'update',
        run_id: 'run-123',
        message: 'Processing',
        data: {
          compliance_agent: { pipeline_status: 'compliance_pass' },
        },
      }),
    } as MessageEvent);

    // Should only call onAgentUpdate for compliance_agent
    expect(onAgentUpdate).toHaveBeenCalledTimes(1);
    expect(onAgentUpdate).toHaveBeenCalledWith('compliance_agent', {
      pipeline_status: 'compliance_pass',
    });
  });

  it('handles empty data object gracefully', () => {
    const onAgentUpdate = vi.fn();
    const onHumanRequired = vi.fn();
    const onError = vi.fn();

    renderHook(() => usePipelineSSE('run-123', onAgentUpdate, onHumanRequired, onError));

    const es = MockEventSource.instances[0];

    es.onmessage?.({
      data: JSON.stringify({
        type: 'update',
        run_id: 'run-123',
        data: {},
      }),
    } as MessageEvent);

    expect(onAgentUpdate).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('handles missing data field gracefully (backwards compatibility)', () => {
    const onAgentUpdate = vi.fn();
    const onHumanRequired = vi.fn();
    const onError = vi.fn();

    renderHook(() => usePipelineSSE('run-123', onAgentUpdate, onHumanRequired, onError));

    const es = MockEventSource.instances[0];

    // Old format without 'data' field
    es.onmessage?.({
      data: JSON.stringify({
        type: 'update',
        run_id: 'run-123',
      }),
    } as MessageEvent);

    expect(onAgentUpdate).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('handles multiple agents in single update event', () => {
    const onAgentUpdate = vi.fn();
    const onHumanRequired = vi.fn();
    const onError = vi.fn();

    renderHook(() => usePipelineSSE('run-123', onAgentUpdate, onHumanRequired, onError));

    const es = MockEventSource.instances[0];

    es.onmessage?.({
      data: JSON.stringify({
        type: 'update',
        data: {
          intake_agent: { pipeline_status: 'intake_complete' },
          trend_agent: { pipeline_status: 'trend_complete' },
          draft_agent: { pipeline_status: 'draft_complete' },
          compliance_agent: { compliance_verdict: 'PASS' },
        },
      }),
    } as MessageEvent);

    expect(onAgentUpdate).toHaveBeenCalledTimes(4);
  });

  it('rejects non-object values in data (robust error handling)', () => {
    const onAgentUpdate = vi.fn();
    const onHumanRequired = vi.fn();
    const onError = vi.fn();

    renderHook(() => usePipelineSSE('run-123', onAgentUpdate, onHumanRequired, onError));

    const es = MockEventSource.instances[0];

    es.onmessage?.({
      data: JSON.stringify({
        type: 'update',
        data: {
          intake_agent: { pipeline_status: 'intake_complete' },
          bad_value: 'this is a string, not an object',
          draft_agent: { pipeline_status: 'draft_complete' },
        },
      }),
    } as MessageEvent);

    // Should only call for valid agent updates (objects)
    expect(onAgentUpdate).toHaveBeenCalledTimes(2);
    expect(onAgentUpdate).toHaveBeenCalledWith('intake_agent', {
      pipeline_status: 'intake_complete',
    });
    expect(onAgentUpdate).toHaveBeenCalledWith('draft_agent', {
      pipeline_status: 'draft_complete',
    });
  });

  // Test that human_required/pipeline_complete still work
  it('handles human_required event (not affected by data field change)', () => {
    const onAgentUpdate = vi.fn();
    const onHumanRequired = vi.fn();
    const onError = vi.fn();

    renderHook(() => usePipelineSSE('run-123', onAgentUpdate, onHumanRequired, onError));

    const es = MockEventSource.instances[0];

    es.onmessage?.({
      data: JSON.stringify({
        type: 'human_required',
        run_id: 'run-123',
      }),
    } as MessageEvent);

    expect(onHumanRequired).toHaveBeenCalledWith('run-123');
    expect(es.closed).toBe(true);
  });

  it('handles pipeline_complete event', () => {
    const onAgentUpdate = vi.fn();
    const onHumanRequired = vi.fn();
    const onError = vi.fn();

    renderHook(() => usePipelineSSE('run-123', onAgentUpdate, onHumanRequired, onError));

    const es = MockEventSource.instances[0];

    es.onmessage?.({
      data: JSON.stringify({
        type: 'pipeline_complete',
        run_id: 'run-123',
      }),
    } as MessageEvent);

    expect(onHumanRequired).toHaveBeenCalledWith('run-123');
    expect(es.closed).toBe(true);
  });

  it('handles error event', () => {
    const onAgentUpdate = vi.fn();
    const onHumanRequired = vi.fn();
    const onError = vi.fn();

    renderHook(() => usePipelineSSE('run-123', onAgentUpdate, onHumanRequired, onError));

    const es = MockEventSource.instances[0];

    es.onmessage?.({
      data: JSON.stringify({
        type: 'error',
        run_id: 'run-123',
        message: 'Pipeline failed: Groq API timeout',
      }),
    } as MessageEvent);

    expect(onError).toHaveBeenCalledWith('Pipeline failed: Groq API timeout');
    expect(es.closed).toBe(true);
  });
});
