import { useState } from 'react';
import { NavLink, Outlet } from 'react-router';
import {
  LayoutDashboard,
  Plus,
  Brain,
  FolderOpen,
  Image,
  Settings as SettingsIcon,
  Search,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { motion } from 'motion/react';

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement> & { className?: string }>;
  end?: boolean;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'WORKSPACE',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/configure', label: 'New Pipeline', icon: Plus },
    ],
  },
  {
    title: 'BRAND HUB',
    items: [
      { to: '/brand-hub', label: 'Style Intel', icon: Brain },
    ],
  },
  {
    title: 'ARCHIVE',
    items: [
      { to: '/pipelines', label: 'My Pipelines', icon: FolderOpen },
      { to: '/gallery', label: 'Gallery', icon: Image },
      { to: '/settings', label: 'Settings', icon: SettingsIcon },
    ],
  },
];

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex min-h-screen bg-bg-primary">
      {/* Sidebar */}
      <motion.aside
        animate={{ width: collapsed ? 64 : 240 }}
        transition={{ duration: 0.25, ease: 'easeInOut' }}
        className="fixed inset-y-0 left-0 z-30 flex flex-col"
        style={{
          background: 'rgba(244, 245, 247, 0.7)',
          backdropFilter: 'blur(12px)',
          boxShadow: 'var(--shadow-md, 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1))',
        }}
      >
        {/* Sidebar toggle */}
        <div className="flex items-center justify-end px-3 py-3">
          <button
            onClick={() => setCollapsed((prev) => !prev)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary hover:bg-bg-surface hover:text-text-primary"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 pb-4">
          {NAV_SECTIONS.map((section) => (
            <div key={section.title}>
              {!collapsed && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.1 }}
                  className="mb-3 block px-3 text-xs font-bold uppercase tracking-widest text-text-secondary"
                >
                  {section.title}
                </motion.span>
              )}
              <div className="flex flex-col gap-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      title={collapsed ? item.label : undefined}
                      className={({ isActive }) =>
                        `group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                          isActive
                            ? 'bg-accent-primary/10 text-accent-primary'
                            : 'text-text-secondary hover:bg-bg-surface hover:text-text-primary'
                        } ${collapsed ? 'justify-center' : ''}`
                      }
                    >
                      <Icon className="h-5 w-5 flex-shrink-0" />
                      {!collapsed && (
                        <motion.span
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.05 }}
                        >
                          {item.label}
                        </motion.span>
                      )}
                      {/* Tooltip on hover when collapsed */}
                      {collapsed && (
                        <span className="pointer-events-none absolute left-full ml-2 hidden whitespace-nowrap rounded-md bg-text-primary px-2 py-1 text-xs text-white shadow-lg group-hover:block">
                          {item.label}
                        </span>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </motion.aside>

      {/* Main wrapper offset by sidebar width */}
      <motion.div
        className="flex min-w-0 flex-1 flex-col"
        animate={{ marginLeft: collapsed ? 64 : 240 }}
        transition={{ duration: 0.25, ease: 'easeInOut' }}
      >
        {/* Global Header */}
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border-default bg-white/80 px-6 backdrop-blur">
          {/* Left: App name */}
          <span className="text-base font-semibold text-text-primary">Lumina</span>

          {/* Center: Search */}
          <div className="mx-4 flex max-w-md flex-1 items-center">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
              <input
                type="text"
                placeholder="Search pipelines..."
                className="w-full rounded-full bg-bg-surface py-1.5 pl-9 pr-4 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-accent-primary/30"
              />
            </div>
          </div>

          {/* Right: User avatar */}
          <div
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
            style={{ background: 'linear-gradient(135deg, var(--color-accent-primary), var(--color-accent-secondary))' }}
          >
            U
          </div>
        </header>

        {/* Content area */}
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </motion.div>
    </div>
  );
}
