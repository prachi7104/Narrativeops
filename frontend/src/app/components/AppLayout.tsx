import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import { LayoutGrid, Library, ListOrdered, Settings as SettingsIcon } from 'lucide-react';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutGrid },
  { to: '/gallery', label: 'Gallery', icon: Library },
  { to: '/pipelines', label: 'Pipelines', icon: ListOrdered },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-bg-primary md:flex">
      <aside className="border-b border-border-default bg-bg-surface md:min-h-screen md:w-64 md:border-b-0 md:border-r">
        <div className="px-4 py-4 md:px-5 md:py-6">
          <p className="text-sm font-semibold text-text-primary">NarrativeOps</p>
          <p className="text-xs text-text-secondary">Agent content pipeline</p>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:px-3 md:pb-0">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? 'bg-accent-primary text-white'
                      : 'text-text-secondary hover:bg-bg-elevated hover:text-text-primary'
                  }`
                }
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
