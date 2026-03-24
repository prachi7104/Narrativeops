import { fireEvent, render, screen, waitFor } from '@testing-library/react';

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

vi.mock('../app/api/client', () => ({
  getOutputs: (...args: unknown[]) => mockGetOutputs(...args),
  getMetrics: (...args: unknown[]) => mockGetMetrics(...args),
  captureDiff: (...args: unknown[]) => mockCaptureDiff(...args),
  approvePipeline: (...args: unknown[]) => mockApprovePipeline(...args),
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
        'Original content',
        'Corrected content for blog',
        'mutual_fund',
      );
    });

    expect(screen.getByText('Correction captured for future drafts')).toBeInTheDocument();
  });
});
