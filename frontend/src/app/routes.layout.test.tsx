import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./screens/Dashboard', () => ({ Dashboard: () => <div>Dashboard Screen</div> }));
vi.mock('./screens/BriefConfiguration', () => ({ BriefConfiguration: () => <div>Configure Screen</div> }));
vi.mock('./screens/PipelineRunning', () => ({ PipelineRunning: () => <div>Pipeline Running Screen</div> }));
vi.mock('./screens/ApprovalGate', () => ({ ApprovalGate: () => <div>Approval Screen</div> }));
vi.mock('./screens/AuditTrail', () => ({ AuditTrail: () => <div>Audit Screen</div> }));
vi.mock('./screens/MyPipelines', () => ({ MyPipelines: () => <div>Pipelines Screen</div> }));
vi.mock('./screens/Gallery', () => ({ Gallery: () => <div>Gallery Screen</div> }));
vi.mock('./screens/Settings', () => ({ Settings: () => <div>Settings Screen</div> }));

import { appRoutes } from './routes';

function renderAt(path: string) {
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

describe('Route layout behavior', () => {
  it('shows sidebar navigation on tab routes', async () => {
    renderAt('/gallery');

    expect(await screen.findByText('NarrativeOps')).toBeInTheDocument();
    expect(screen.getByText('Gallery Screen')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Settings/i })).toBeInTheDocument();
  });

  it('hides sidebar on pipeline running route', async () => {
    renderAt('/pipeline/run-99');

    expect(await screen.findByText('Pipeline Running Screen')).toBeInTheDocument();
    expect(screen.queryByText('NarrativeOps')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Dashboard/i })).not.toBeInTheDocument();
  });

  it('exposes sidebar route targets for navigation', async () => {
    renderAt('/');

    expect(await screen.findByText('Dashboard Screen')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Settings/i })).toHaveAttribute('href', '/settings');
    expect(screen.getByRole('link', { name: /Gallery/i })).toHaveAttribute('href', '/gallery');
  });
});
