import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowRight, FileText, Linkedin, Loader2, MessageCircle, Twitter } from 'lucide-react';

import { getOutputs, listRuns } from '../api/client';
import type { PipelineOutput, RunSummary } from '../api/types';

type FilterStatus = 'all' | 'completed' | 'awaiting_approval';

type OutputsByRun = Record<string, PipelineOutput[]>;

const CHANNEL_ICONS = {
  blog: FileText,
  twitter: Twitter,
  linkedin: Linkedin,
  whatsapp: MessageCircle,
  article: FileText,
};

const CHANNEL_LABELS: Record<keyof typeof CHANNEL_ICONS, string> = {
  blog: 'Blog',
  twitter: 'Twitter',
  linkedin: 'LinkedIn',
  whatsapp: 'WhatsApp',
  article: 'Article',
};

export function Gallery() {
  const navigate = useNavigate();
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [outputsByRun, setOutputsByRun] = useState<OutputsByRun>({});
  const [loading, setLoading] = useState(true);
  const [loadingOutputsFor, setLoadingOutputsFor] = useState<string | null>(null);

  useEffect(() => {
    listRuns(50)
      .then(setRuns)
      .catch((err) => {
        console.error('Failed to load runs for gallery', err);
        setRuns([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const filteredRuns = useMemo(() => {
    return runs.filter((run) => {
      const matchesFilter = filter === 'all' || run.status === filter;
      const matchesSearch = run.brief_topic.toLowerCase().includes(search.toLowerCase());
      return matchesFilter && matchesSearch;
    });
  }, [runs, filter, search]);

  const handleToggleExpand = async (runId: string) => {
    if (expandedRunId === runId) {
      setExpandedRunId(null);
      return;
    }

    setExpandedRunId(runId);
    if (outputsByRun[runId]) {
      return;
    }

    setLoadingOutputsFor(runId);
    try {
      const outputs = await getOutputs(runId);
      setOutputsByRun((prev) => ({ ...prev, [runId]: outputs }));
    } catch (err) {
      console.error('Failed to load outputs for run', runId, err);
      setOutputsByRun((prev) => ({ ...prev, [runId]: [] }));
    } finally {
      setLoadingOutputsFor(null);
    }
  };

  const formatMeta = (run: RunSummary) => {
    const createdAt = new Date(run.created_at);
    const date = Number.isNaN(createdAt.getTime()) ? run.created_at : createdAt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    const durationMs = run.total_duration_ms || 0;
    const mins = Math.floor(durationMs / 60000);
    const secs = Math.floor((durationMs % 60000) / 1000);
    const durationText = durationMs > 0 ? `${mins}m ${secs}s` : 'N/A';
    return `${date} · ${durationText} · ${run.status.replace('_', ' ')}`;
  };

  const metadataRows = (run: RunSummary) => {
    return [
      { label: 'Hours saved', value: `${(run.estimated_hours_saved || 0).toFixed(1)}h` },
      { label: 'Compliance loops', value: String(run.compliance_iterations || 0) },
      { label: 'Trend sources', value: String(run.trend_sources_used || 0) },
    ];
  };

  const channelStatus = (channel: keyof typeof CHANNEL_ICONS, outputs: PipelineOutput[]) => {
    const exists = outputs.some((output) => output.channel === channel);
    return exists ? 'Available' : 'Pending';
  };

  return (
    <div className="min-h-screen bg-bg-primary">
      <div className="border-b border-border-default">
        <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
          <h2 className="text-2xl text-text-primary">Gallery</h2>
          <p className="mt-1 text-sm text-text-secondary">Published content archive across pipeline runs.</p>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
        <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search topic"
            className="w-full rounded-md border border-border-default bg-bg-surface px-4 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent-primary focus:outline-none"
          />
          <div className="flex gap-2">
            {(['all', 'completed', 'awaiting_approval'] as FilterStatus[]).map((value) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={`rounded-md px-3 py-2 text-xs capitalize transition-colors ${
                  filter === value
                    ? 'bg-accent-primary text-white'
                    : 'border border-border-default bg-bg-surface text-text-secondary hover:text-text-primary'
                }`}
              >
                {value === 'awaiting_approval' ? 'Awaiting' : value}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading gallery...
          </div>
        ) : filteredRuns.length === 0 ? (
          <div className="rounded-md border border-dashed border-border-default bg-bg-surface p-8 text-center text-sm text-text-secondary">
            No runs found for this filter.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {filteredRuns.map((run) => {
              const outputs = outputsByRun[run.id] || [];
              const isExpanded = expandedRunId === run.id;
              return (
                <div key={run.id} className="rounded-md border border-border-default bg-bg-surface p-5">
                  <h3 className="line-clamp-2 text-text-primary">{run.brief_topic || 'Untitled run'}</h3>
                  <p className="mt-2 text-xs text-text-secondary">{formatMeta(run)}</p>

                  <div className="mt-3 grid grid-cols-3 gap-2 rounded-md border border-border-default bg-bg-primary p-2">
                    {metadataRows(run).map((item) => (
                      <div key={`${run.id}-${item.label}`}>
                        <p className="text-[10px] uppercase tracking-wide text-text-tertiary">{item.label}</p>
                        <p className="text-xs font-medium text-text-primary">{item.value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {(['blog', 'twitter', 'linkedin', 'whatsapp', 'article'] as Array<keyof typeof CHANNEL_ICONS>).map((channel, idx) => {
                      const Icon = CHANNEL_ICONS[channel] || FileText;
                      const status = channelStatus(channel, outputs);
                      return (
                        <span
                          key={`${run.id}-${channel}-${idx}`}
                          className={`flex items-center gap-1 rounded-full border px-2 py-1 text-xs ${
                            status === 'Available'
                              ? 'border-success/30 bg-success/10 text-success'
                              : 'border-border-default bg-bg-surface text-text-secondary'
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {CHANNEL_LABELS[channel]} · {status}
                        </span>
                      );
                    })}
                  </div>

                  <div className="mt-4 flex items-center justify-between">
                    <button
                      onClick={() => handleToggleExpand(run.id)}
                      className="text-sm text-accent-primary hover:underline"
                    >
                      {isExpanded ? 'Hide' : 'View'}
                    </button>
                    <button
                      onClick={() => navigate(run.status === 'awaiting_approval' ? `/approval/${run.id}` : `/audit/${run.id}`)}
                      className="flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary"
                    >
                      Open
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="mt-4 space-y-3 border-t border-border-default pt-4">
                      {loadingOutputsFor === run.id ? (
                        <div className="flex items-center gap-2 text-xs text-text-secondary">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Loading channel outputs...
                        </div>
                      ) : outputs.length === 0 ? (
                        <p className="text-xs text-text-secondary">No outputs found for this run.</p>
                      ) : (
                        outputs.map((output) => (
                          <div key={`${run.id}-${output.channel}-${output.language}`} className="rounded-md border border-border-default bg-bg-primary p-3">
                            <p className="text-xs font-medium text-text-primary">
                              {output.channel} ({output.language.toUpperCase()})
                            </p>
                            <p className="mt-1 line-clamp-3 text-xs text-text-secondary">{output.content.replace(/<[^>]*>/g, '').trim()}</p>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
