import {
  captureDiff,
  getOutputs,
  listRuns,
  reloadSettingsRules,
  startPipeline,
  uploadBrandGuide,
} from './client';

describe('api/client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('startPipeline sends correct request', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ run_id: 'test-123', status: 'started' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await startPipeline({ topic: 'RBI rate cut', description: 'test' }, 'session-001');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/pipeline/run');
    expect((options as RequestInit).method).toBe('POST');

    const body = JSON.parse(String((options as RequestInit).body));
    expect(body.brief.topic).toBe('RBI rate cut');
    expect(body.brief.session_id).toBe('session-001');
  });

  it('uploadBrandGuide sends multipart/form-data', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          session_id: 's1',
          rules_extracted: 12,
          preview: [],
          error: null,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    const mockFile = new File(['%PDF-1.4 mock'], 'guide.pdf', { type: 'application/pdf' });
    await uploadBrandGuide(mockFile, 'session-001');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/upload-guide');
    expect((options as RequestInit).method).toBe('POST');
    expect((options as RequestInit).body).toBeInstanceOf(FormData);
  });

  it('captureDiff sends correct payload', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ status: 'captured', diff_summary: 'ok', corrections_count: 1 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await captureDiff('run-1', 'blog', 'en', 'original', 'corrected', 'mutual_fund');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/pipeline/run-1/diff');
    expect((options as RequestInit).method).toBe('POST');

    const body = JSON.parse(String((options as RequestInit).body));
    expect(body.channel).toBe('blog');
    expect(body.language).toBe('en');
    expect(body.original_text).toBe('original');
    expect(body.corrected_text).toBe('corrected');
    expect(body.content_category).toBe('mutual_fund');
  });

  it('client throws on non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Internal server error', {
        status: 500,
        statusText: 'Internal Server Error',
      }),
    );

    await expect(getOutputs('run-1')).rejects.toThrow(/500/);
  });

  it('listRuns falls back to dashboard summary when runs endpoint is missing', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response('Not Found', {
          status: 404,
          statusText: 'Not Found',
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            most_recent_runs: [
              {
                id: 'run-1',
                brief_topic: 'SIP strategy',
                status: 'completed',
                created_at: '2026-01-01T00:00:00Z',
              },
            ],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );

    const runs = await listRuns(20, 'all');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/pipeline/runs');
    expect(String(fetchMock.mock.calls[1][0])).toContain('/api/dashboard/summary');
    expect(runs).toHaveLength(1);
    expect(runs[0].id).toBe('run-1');
    expect(runs[0].compliance_verdict).toBe('PASS');
  });

  it('reloadSettingsRules returns unavailable when endpoint is missing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Not Found', {
        status: 404,
        statusText: 'Not Found',
      }),
    );

    const result = await reloadSettingsRules();

    expect(result.status).toBe('unavailable');
    expect(result.count).toBe(0);
    expect(result.source).toBe('unavailable');
  });
});
