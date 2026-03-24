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

describe('usePipelineSSE', () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    vi.stubGlobal('EventSource', MockEventSource as unknown as typeof EventSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not create EventSource when runId is null', () => {
    const onAgentUpdate = vi.fn();
    const onHumanRequired = vi.fn();
    const onError = vi.fn();

    renderHook(() => usePipelineSSE(null, onAgentUpdate, onHumanRequired, onError));

    expect(MockEventSource.instances).toHaveLength(0);
  });

  it('creates EventSource with run URL', () => {
    const onAgentUpdate = vi.fn();
    const onHumanRequired = vi.fn();
    const onError = vi.fn();

    renderHook(() => usePipelineSSE('run-42', onAgentUpdate, onHumanRequired, onError));

    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0].url).toContain('/api/pipeline/run-42/stream');
  });

  it('routes update event to onUpdate', () => {
    const onAgentUpdate = vi.fn();
    const onHumanRequired = vi.fn();
    const onError = vi.fn();

    renderHook(() => usePipelineSSE('run-42', onAgentUpdate, onHumanRequired, onError));

    const es = MockEventSource.instances[0];
    es.onmessage?.(
      {
        data: JSON.stringify({ type: 'update', data: { draft_agent: { pipeline_status: 'running' } } }),
      } as MessageEvent,
    );

    expect(onAgentUpdate).toHaveBeenCalledWith('draft_agent', { pipeline_status: 'running' });
    expect(onHumanRequired).not.toHaveBeenCalled();
  });

  it('routes human_required event and closes stream', () => {
    const onAgentUpdate = vi.fn();
    const onHumanRequired = vi.fn();
    const onError = vi.fn();

    renderHook(() => usePipelineSSE('run-42', onAgentUpdate, onHumanRequired, onError));

    const es = MockEventSource.instances[0];
    es.onmessage?.(
      {
        data: JSON.stringify({ type: 'human_required', run_id: 'run-42' }),
      } as MessageEvent,
    );

    expect(onHumanRequired).toHaveBeenCalledWith('run-42');
    expect(es.closed).toBe(true);
  });

  it('closes EventSource on unmount', () => {
    const onAgentUpdate = vi.fn();
    const onHumanRequired = vi.fn();
    const onError = vi.fn();

    const { unmount } = renderHook(() =>
      usePipelineSSE('run-42', onAgentUpdate, onHumanRequired, onError),
    );

    const es = MockEventSource.instances[0];
    expect(es.closed).toBe(false);

    unmount();

    expect(es.closed).toBe(true);
  });
});
