import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { Gallery } from './Gallery';

const mockNavigate = vi.fn();
const mockListRuns = vi.fn();
const mockGetOutputs = vi.fn();

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../api/client', () => ({
  listRuns: (...args: unknown[]) => mockListRuns(...args),
  getOutputs: (...args: unknown[]) => mockGetOutputs(...args),
}));

describe('Gallery', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockListRuns.mockResolvedValue([
      {
        id: 'run-1',
        brief_topic: 'SIP for first-time investors',
        status: 'completed',
        created_at: '2026-03-14T10:00:00Z',
        total_duration_ms: 263000,
        compliance_iterations: 2,
        estimated_hours_saved: 1.8,
        trend_sources_used: 3,
      },
    ]);

    mockGetOutputs.mockResolvedValue([
      { channel: 'blog', language: 'en', content: '<p>Blog output</p>', approved: true },
      { channel: 'twitter', language: 'en', content: '["tweet 1"]', approved: true },
      { channel: 'linkedin', language: 'en', content: 'LinkedIn output', approved: true },
    ]);
  });

  it('shows richer metadata cards for each run', async () => {
    render(<Gallery />);

    expect(await screen.findByText('SIP for first-time investors')).toBeInTheDocument();
    expect(screen.getByText('Hours saved')).toBeInTheDocument();
    expect(screen.getByText('Compliance loops')).toBeInTheDocument();
    expect(screen.getByText('Trend sources')).toBeInTheDocument();
  });

  it('loads outputs and shows channel status chips', async () => {
    render(<Gallery />);

    await screen.findByText('SIP for first-time investors');
    fireEvent.click(screen.getByRole('button', { name: 'View' }));

    await waitFor(() => {
      expect(mockGetOutputs).toHaveBeenCalledWith('run-1');
    });

    expect(screen.getByText('Blog · Available')).toBeInTheDocument();
    expect(screen.getByText('Article · Pending')).toBeInTheDocument();
  });

  it('navigates to audit on open click for completed runs', async () => {
    render(<Gallery />);

    await screen.findByText('SIP for first-time investors');
    fireEvent.click(screen.getByRole('button', { name: /Open/i }));

    expect(mockNavigate).toHaveBeenCalledWith('/audit/run-1');
  });
});
