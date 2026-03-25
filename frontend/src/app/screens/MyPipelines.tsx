import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import {
  Search,
  Twitter,
  Linkedin,
  MessageCircle,
  FileText,
  Newspaper,
  Inbox,
} from 'lucide-react';
import { motion } from 'motion/react';
import { listRuns } from '../api/client';
import type { RunSummary } from '../api/types';

type StatusFilter = 'all' | 'running' | 'completed' | 'failed';

function formatDate(iso: string): string {
  try {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return '1 day ago';
    if (diffDays < 30) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  } catch {
    return iso;
  }
}

function getStatusBadge(status: RunSummary['status']) {
  switch (status) {
    case 'completed':
      return { label: 'Completed', classes: 'bg-success text-white' };
    case 'running':
      return { label: 'Processing', classes: 'badge-processing bg-accent-primary text-white' };
    case 'awaiting_approval':
      return { label: 'Awaiting Review', classes: 'bg-warning text-white' };
    case 'failed':
      return { label: 'Failed', classes: 'bg-error text-white' };
    case 'escalated':
      return { label: 'Escalated', classes: 'bg-orange-500 text-white' };
  }
}

function getComplianceStyle(verdict: string | undefined) {
  switch (verdict) {
    case 'PASS':
      return 'text-success';
    case 'REJECT':
      return 'text-error';
    case 'ERROR':
      return 'text-error';
    case 'PENDING':
      return 'text-text-tertiary';
    default:
      return 'text-text-tertiary';
  }
}

function getChannelIcon(channel: string) {
  switch (channel.toLowerCase()) {
    case 'faq':
      return FileText;
    case 'publisher_brief':
      return Newspaper;
    case 'twitter':
      return Twitter;
    case 'linkedin':
      return Linkedin;
    case 'whatsapp':
      return MessageCircle;
    case 'blog':
      return FileText;
    case 'newsletter':
    case 'press_release':
      return Newspaper;
    default:
      return FileText;
  }
}

function getRouteForRun(run: RunSummary): string {
  if (run.status === 'awaiting_approval') return `/approval/${run.id}`;
  return `/audit/${run.id}`;
}

function SkeletonCards() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="card p-5 space-y-3">
          <div className="skeleton h-4 w-3/4 rounded" />
          <div className="skeleton h-3 w-1/2 rounded" />
          <div className="skeleton h-3 w-1/3 rounded" />
        </div>
      ))}
    </div>
  );
}

export function MyPipelines() {
  const navigate = useNavigate();
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  useEffect(() => {
    listRuns(50)
      .then((data: RunSummary[]) => {
        setRuns(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load pipelines:', err);
        setLoading(false);
      });
  }, []);

  const filtered = runs.filter((run) => {
    const matchesSearch = (run.brief_topic || '')
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesStatus =
      statusFilter === 'all' || run.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const filterButtons: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'running', label: 'Running' },
    { key: 'completed', label: 'Completed' },
    { key: 'failed', label: 'Failed' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="min-h-screen bg-bg-primary"
    >
      {/* Header */}
      <div className="border-b border-border-default">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
            <h2 className="text-xl md:text-2xl text-text-primary">
              My Pipelines
            </h2>
            <button
              onClick={() => navigate('/')}
              className="w-full md:w-auto px-4 py-2 bg-accent-primary text-white rounded-md hover:bg-accent-primary/90 transition-colors"
            >
              New pipeline
            </button>
          </div>

          {/* Search and Filter */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by topic..."
                className="w-full pl-10 pr-4 py-2 bg-bg-surface border border-border-default rounded-md text-text-primary placeholder:text-text-tertiary focus:border-accent-primary focus:outline-none transition-colors"
              />
            </div>
            <div className="flex gap-1 bg-bg-surface border border-border-default rounded-md p-1">
              {filterButtons.map((btn) => (
                <button
                  key={btn.key}
                  onClick={() => setStatusFilter(btn.key)}
                  className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                    statusFilter === btn.key
                      ? 'bg-accent-primary text-white'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-8">
        {loading ? (
          <SkeletonCards />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-20 h-20 mb-4 bg-bg-surface rounded-full flex items-center justify-center">
              <Inbox className="w-10 h-10 text-text-tertiary" />
            </div>
            <h3 className="text-lg font-medium text-text-primary mb-1">
              No pipelines found
            </h3>
            <p className="text-text-secondary text-sm">
              {searchQuery || statusFilter !== 'all'
                ? 'Try adjusting your search or filters.'
                : 'Create your first pipeline to get started.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((run) => {
              const badge = getStatusBadge(run.status);
              const channels = run.output_options ?? [];
              const verdict = run.compliance_verdict ?? 'PENDING';
              const language = run.has_hindi ? 'EN + HI' : 'EN';

              return (
                <div
                  key={run.id}
                  onClick={() => navigate(getRouteForRun(run))}
                  className="card p-5 cursor-pointer hover:shadow-md transition-shadow space-y-3"
                >
                  {/* Title and status */}
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-medium text-text-primary leading-snug line-clamp-2">
                      {run.brief_topic || 'Untitled'}
                    </h3>
                    <span
                      className={`shrink-0 px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.classes}`}
                    >
                      {badge.label}
                    </span>
                  </div>

                  {/* Channel icons */}
                  {channels.length > 0 && (
                    <div className="flex gap-2">
                      {channels.map((ch) => {
                        const Icon = getChannelIcon(ch);
                        return (
                          <div
                            key={ch}
                            className="w-7 h-7 bg-bg-elevated rounded flex items-center justify-center"
                            title={ch}
                          >
                            <Icon className="w-3.5 h-3.5 text-text-secondary" />
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Meta row */}
                  <div className="flex items-center gap-3 text-xs text-text-secondary">
                    <span className={`font-medium ${getComplianceStyle(verdict)}`}>
                      {verdict}
                    </span>
                    <span className="text-border-default">|</span>
                    <span>{language}</span>
                    <span className="text-border-default">|</span>
                    <span>{formatDate(run.created_at)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}
