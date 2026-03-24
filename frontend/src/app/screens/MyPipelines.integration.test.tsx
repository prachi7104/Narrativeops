/**
 * Integration tests for MyPipelines screen - Phase 1 B9 fix validation
 * Tests real API integration vs hardcoded mock data
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { MyPipelines } from './MyPipelines';
import * as client from '../api/client';

// Mock the API client
vi.mock('../api/client', () => ({
  getRecentRuns: vi.fn(),
}));

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('MyPipelines - B9 API Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('B9: fetches real data from API instead of using mock data', async () => {
    const mockRuns = [
      {
        id: 'real-run-1',
        brief_topic: 'AI in Healthcare',
        status: 'completed',
        created_at: new Date().toISOString(),
      },
      {
        id: 'real-run-2',
        brief_topic: 'Market Analysis Q4',
        status: 'awaiting_approval',
        created_at: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
      },
    ];

    vi.mocked(client.getRecentRuns).mockResolvedValue(mockRuns);

    render(
      <MemoryRouter>
        <MyPipelines />
      </MemoryRouter>,
    );

    // Should call API on mount
    await waitFor(() => {
      expect(client.getRecentRuns).toHaveBeenCalledTimes(1);
    });

    // Should display real data from API
    await waitFor(() => {
      expect(screen.getByText('AI in Healthcare')).toBeInTheDocument();
      expect(screen.getByText('Market Analysis Q4')).toBeInTheDocument();
    });
  });

  it('shows loading state while fetching', () => {
    vi.mocked(client.getRecentRuns).mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 1000)),
    );

    render(
      <MemoryRouter>
        <MyPipelines />
      </MemoryRouter>,
    );

    expect(screen.getByText('Loading pipelines...')).toBeInTheDocument();
  });

  it('shows empty state when no pipelines exist', async () => {
    vi.mocked(client.getRecentRuns).mockResolvedValue([]);

    render(
      <MemoryRouter>
        <MyPipelines />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('No pipelines yet')).toBeInTheDocument();
      expect(
        screen.getByText('Create your first content pipeline to get started'),
      ).toBeInTheDocument();
    });
  });

  it('handles API errors gracefully', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(client.getRecentRuns).mockRejectedValue(new Error('Network error'));

    render(
      <MemoryRouter>
        <MyPipelines />
      </MemoryRouter>,
    );

    // Should show empty state even on error
    await waitFor(() => {
      expect(screen.getByText('No pipelines yet')).toBeInTheDocument();
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to load pipelines:',
      expect.any(Error),
    );

    consoleErrorSpy.mockRestore();
  });

  it('formats timestamps correctly', async () => {
    const now = Date.now();
    const mockRuns = [
      {
        id: '1',
        brief_topic: 'Recent Post',
        status: 'completed',
        created_at: new Date(now - 30 * 60 * 1000).toISOString(), // 30 min ago
      },
      {
        id: '2',
        brief_topic: 'Hours Ago Post',
        status: 'completed',
        created_at: new Date(now - 5 * 60 * 60 * 1000).toISOString(), // 5 hours ago
      },
      {
        id: '3',
        brief_topic: 'Days Ago Post',
        status: 'completed',
        created_at: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
      },
    ];

    vi.mocked(client.getRecentRuns).mockResolvedValue(mockRuns);

    render(
      <MemoryRouter>
        <MyPipelines />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('5 hours ago')).toBeInTheDocument();
      expect(screen.getByText('2 days ago')).toBeInTheDocument();
    });
  });

  it('maps backend status to display status correctly', async () => {
    const mockRuns = [
      {
        id: '1',
        brief_topic: 'Completed Run',
        status: 'completed',
        created_at: new Date().toISOString(),
      },
      {
        id: '2',
        brief_topic: 'Awaiting Run',
        status: 'awaiting_approval',
        created_at: new Date().toISOString(),
      },
      {
        id: '3',
        brief_topic: 'Failed Run',
        status: 'failed',
        created_at: new Date().toISOString(),
      },
      {
        id: '4',
        brief_topic: 'Escalated Run',
        status: 'escalated',
        created_at: new Date().toISOString(),
      },
    ];

    vi.mocked(client.getRecentRuns).mockResolvedValue(mockRuns);

    render(
      <MemoryRouter>
        <MyPipelines />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Completed')).toBeInTheDocument();
      expect(screen.getByText('Awaiting approval')).toBeInTheDocument();
      expect(screen.getByText('Failed')).toBeInTheDocument();
      expect(screen.getByText('Escalated')).toBeInTheDocument();
    });
  });

  it('handles missing brief_topic with fallback', async () => {
    const mockRuns = [
      {
        id: '1',
        brief_topic: '', // empty
        status: 'completed',
        created_at: new Date().toISOString(),
      },
      {
        id: '2',
        brief_topic: null as any, // null
        status: 'completed',
        created_at: new Date().toISOString(),
      },
    ];

    vi.mocked(client.getRecentRuns).mockResolvedValue(mockRuns);

    render(
      <MemoryRouter>
        <MyPipelines />
      </MemoryRouter>,
    );

    await waitFor(() => {
      const untitledElements = screen.getAllByText('Untitled');
      expect(untitledElements).toHaveLength(2);
    });
  });

  it('only calls API once on mount (no unnecessary refetches)', async () => {
    vi.mocked(client.getRecentRuns).mockResolvedValue([]);

    const { rerender } = render(
      <MemoryRouter>
        <MyPipelines />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(client.getRecentRuns).toHaveBeenCalledTimes(1);
    });

    // Rerender shouldn't trigger another call
    rerender(
      <MemoryRouter>
        <MyPipelines />
      </MemoryRouter>,
    );

    // Still only 1 call (useEffect dependency array is empty [])
    expect(client.getRecentRuns).toHaveBeenCalledTimes(1);
  });
});
