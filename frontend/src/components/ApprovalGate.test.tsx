import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApprovalGate } from '../app/screens/ApprovalGate';

const mockNavigate = vi.fn();

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');
  return {
    ...actual,
    useParams: () => ({ id: 'run-123' }),
    useNavigate: () => mockNavigate,
    useLocation: () => ({ state: { category: 'mutual_fund' } }),
  };
});

const mockGetOutputs = vi.fn();
const mockGetMetrics = vi.fn();
const mockCaptureDiff = vi.fn();
const mockApprovePipeline = vi.fn();
const mockGetAuditTrail = vi.fn();

vi.mock('../app/api/client', () => ({
  getOutputs: (...args: unknown[]) => mockGetOutputs(...args),
  getMetrics: (...args: unknown[]) => mockGetMetrics(...args),
  captureDiff: (...args: unknown[]) => mockCaptureDiff(...args),
  approvePipeline: (...args: unknown[]) => mockApprovePipeline(...args),
  getAuditTrail: (...args: unknown[]) => mockGetAuditTrail(...args),
}));

describe('ApprovalGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetOutputs.mockResolvedValue([
      { channel: 'blog', language: 'en', content: '<p>Original content</p>' },
      { channel: 'twitter', language: 'en', content: '["tweet 1"]' },
      { channel: 'linkedin', language: 'en', content: 'LinkedIn copy' },
      { channel: 'whatsapp', language: 'en', content: 'WhatsApp copy' },
      { channel: 'blog', language: 'hi', content: 'Hindi copy' },
    ]);

    mockGetMetrics.mockResolvedValue({
      time_saved_seconds: 154,
      cost_saved_usd: 12.34,
      time_saved_display: '2m 34s',
      cost_saved_display: '$12.34',
      brand_rules_used: true,
      trend_sources_used: 2,
    });

    mockCaptureDiff.mockResolvedValue({
      status: 'captured',
      diff_summary: 'updated',
      corrections_count: 1,
    });

    mockApprovePipeline.mockResolvedValue({ status: 'approved' });

    mockGetAuditTrail.mockResolvedValue([
      {
        agent_name: 'compliance_agent',
        action: 'checked_compliance',
        verdict: 'REVISE',
        model_used: 'llama',
        duration_ms: 120,
        created_at: new Date().toISOString(),
        output_summary: JSON.stringify({
          format: 'compliance_v1',
          verdict: 'REVISE',
          summary: '2 issues found',
          annotations: [
            {
              severity: 'error',
              rule_id: 'SEBI01',
              message: 'Avoid guaranteed claims',
              sentence: 'Guaranteed 12% returns',
              suggested_fix: 'Projected returns may vary with market conditions',
            },
            {
              severity: 'warning',
              rule_id: 'ASCI03',
              message: 'Avoid excessive emphasis',
              sentence: 'BEST EVER!!!',
            },
          ],
        }),
      },
    ]);
  });

  it('renders metrics panel from API values', async () => {
    render(<ApprovalGate />);

    expect(await screen.findByText('Impact this run')).toBeInTheDocument();
    expect(screen.getAllByText('2m 34s').length).toBeGreaterThan(0);
    expect(screen.getByText('$12.34')).toBeInTheDocument();
    expect(screen.getByText('Custom brand rules')).toBeInTheDocument();
    expect(screen.getByText('Grounded')).toBeInTheDocument();
  });

  it('captures diff on save and shows toast', async () => {
    render(<ApprovalGate />);

    await screen.findByText('Review your content');

    fireEvent.click(screen.getByRole('button', { name: /edit content/i }));

    const textbox = await screen.findByRole('textbox');
    fireEvent.change(textbox, { target: { value: 'Corrected content for blog' } });

    fireEvent.click(screen.getByRole('button', { name: /save edits/i }));

    await waitFor(() => {
      expect(mockCaptureDiff).toHaveBeenCalledWith(
        'run-123',
        'blog',
        'en',
        '<p>Original content</p>',
        'Corrected content for blog',
        'mutual_fund',
      );
    });

    expect(screen.getByText('Correction captured for future drafts')).toBeInTheDocument();
  });

  it('renders grouped annotation severities and suggested fixes', async () => {
    render(<ApprovalGate />);

    expect(await screen.findByText('Compliance summary')).toBeInTheDocument();
    expect(screen.getByText('High severity: 1')).toBeInTheDocument();
    expect(screen.getByText('Medium severity: 1')).toBeInTheDocument();
    expect(screen.getByText('Avoid guaranteed claims')).toBeInTheDocument();
    expect(screen.getByText(/Suggested fix:/i)).toBeInTheDocument();
    expect(screen.getByText(/SEBI01/i)).toBeInTheDocument();
  });
});
