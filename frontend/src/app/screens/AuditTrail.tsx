import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { ArrowLeft, Download, ChevronDown, ChevronUp, Edit3 } from 'lucide-react';

import { getAuditTrail, getAuditPdfUrl } from '../api/client';
import type { AuditEvent } from '../api/types';

type Filter = 'all' | 'compliance' | 'edits';
type Verdict = 'PASS' | 'REVISE' | 'REJECT' | '—';

interface AuditEntry {
  id: string;
  agent: string;
  action: string;
  verdict: Verdict;
  model: string;
  duration: string;
  timestamp: string;
  summary: string;
  isCompliance: boolean;
  isTrend: boolean;
  isUserEdit: boolean;
  sourceCount?: number;
}

function mapEventToRow(event: AuditEvent, index: number): AuditEntry {
  let summary = event.output_summary || '';
  if (event.agent_name === 'compliance_agent' && summary) {
    try {
      const parsed = JSON.parse(summary) as { summary?: string; verdict?: string };
      summary = parsed.summary || parsed.verdict || summary;
    } catch {
      // Keep legacy plain-text summary as-is.
    }
  }
  const sourcesMatch = summary.match(/from\s+(\d+)\s+sources?/i);
  const sourceCount = sourcesMatch ? Number(sourcesMatch[1]) : undefined;

  return {
    id: `${index}-${event.created_at}`,
    agent: event.agent_name,
    action: event.action,
    verdict: (event.verdict as Verdict) || '—',
    model: event.model_used || '—',
    duration: event.duration_ms ? `${event.duration_ms}ms` : '—',
    timestamp: new Date(event.created_at).toLocaleTimeString(),
    summary,
    isCompliance: event.agent_name === 'compliance_agent',
    isTrend: event.agent_name === 'trend_agent',
    isUserEdit: event.agent_name === 'user_edit',
    sourceCount,
  };
}

export function AuditTrail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [auditData, setAuditData] = useState<AuditEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!id) return;
    setIsLoading(true);
    getAuditTrail(id)
      .then((events) => {
        setAuditData(events.map((event, idx) => mapEventToRow(event, idx)));
      })
      .catch((err) => {
        console.error('Failed to load audit events:', err);
        setAuditData([]);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [id]);

  const toggleRow = (rowId: string) => {
    setExpandedRows((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(rowId)) {
        newSet.delete(rowId);
      } else {
        newSet.add(rowId);
      }
      return newSet;
    });
  };

  const filteredData = auditData.filter((entry) => {
    if (filter === 'all') return true;
    if (filter === 'compliance') return entry.isCompliance;
    if (filter === 'edits') return entry.isUserEdit;
    return true;
  });

  const getVerdictStyle = (verdict?: Verdict) => {
    if (!verdict) return '';
    switch (verdict) {
      case 'PASS':
        return 'bg-success/10 text-success border-success/30';
      case 'REVISE':
        return 'bg-warning/10 text-warning border-warning/30';
      case 'REJECT':
        return 'bg-error/10 text-error border-error/30';
    }
  };

  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Header */}
      <div className="border-b border-border-default">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate(`/approval/${id}`)}
                className="text-text-secondary hover:text-text-primary transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h2 className="text-xl md:text-2xl">Audit trail</h2>
                <p className="text-text-secondary text-xs md:text-sm font-mono mt-1">Pipeline {id}</p>
              </div>
            </div>

              <a
                href={id ? getAuditPdfUrl(id) : '#'}
                download
                className="flex items-center gap-2 px-4 py-2 bg-bg-surface border border-border-default rounded-md text-text-primary hover:bg-bg-elevated transition-colors text-sm"
              >
              <Download className="w-4 h-4" />
              <span className="hidden md:inline">Download PDF</span>
              <span className="md:hidden">PDF</span>
              </a>
          </div>
        </div>
      </div>

      {/* Filter Row */}
      <div className="border-b border-border-default">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-4">
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-md text-sm transition-colors ${
                filter === 'all'
                  ? 'bg-accent-primary text-white'
                  : 'bg-bg-surface text-text-secondary hover:text-text-primary'
              }`}
            >
              All agents
            </button>
            <button
              onClick={() => setFilter('compliance')}
              className={`px-4 py-2 rounded-md text-sm transition-colors ${
                filter === 'compliance'
                  ? 'bg-accent-primary text-white'
                  : 'bg-bg-surface text-text-secondary hover:text-text-primary'
              }`}
            >
              Compliance only
            </button>
            <button
              onClick={() => setFilter('edits')}
              className={`px-4 py-2 rounded-md text-sm transition-colors ${
                filter === 'edits'
                  ? 'bg-accent-primary text-white'
                  : 'bg-bg-surface text-text-secondary hover:text-text-primary'
              }`}
            >
              User edits only
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="bg-bg-surface border border-border-default rounded-[--radius-md] overflow-hidden">
          {/* Table Header */}
          <div className="grid grid-cols-12 gap-4 px-6 py-4 border-b border-border-default bg-bg-elevated text-text-secondary text-xs font-medium uppercase tracking-wider">
            <div className="col-span-2">Agent</div>
            <div className="col-span-2">Action</div>
            <div className="col-span-1">Verdict</div>
            <div className="col-span-2">Model</div>
            <div className="col-span-1">Duration</div>
            <div className="col-span-1">Timestamp</div>
            <div className="col-span-3">Summary</div>
          </div>

          {/* Table Body */}
          <div className="divide-y divide-border-default">
            {isLoading && Array.from({ length: 5 }).map((_, idx) => (
              <div key={`skeleton-${idx}`} className="grid grid-cols-12 gap-4 px-6 py-4">
                <div className="col-span-2 h-4 bg-bg-elevated rounded animate-pulse" />
                <div className="col-span-2 h-4 bg-bg-elevated rounded animate-pulse" />
                <div className="col-span-1 h-4 bg-bg-elevated rounded animate-pulse" />
                <div className="col-span-2 h-4 bg-bg-elevated rounded animate-pulse" />
                <div className="col-span-1 h-4 bg-bg-elevated rounded animate-pulse" />
                <div className="col-span-1 h-4 bg-bg-elevated rounded animate-pulse" />
                <div className="col-span-3 h-4 bg-bg-elevated rounded animate-pulse" />
              </div>
            ))}

            {!isLoading && filteredData.length === 0 && (
              <div className="px-6 py-8 text-sm text-text-secondary">No audit events found</div>
            )}

            {filteredData.map((entry) => {
              const isExpanded = expandedRows.has(entry.id);
              const hasDetails = entry.isCompliance && entry.verdict === 'REVISE';

              return (
                <div key={entry.id}>
                  <div
                    className={`grid grid-cols-12 gap-4 px-6 py-4 hover:bg-bg-elevated transition-colors ${
                      hasDetails ? 'cursor-pointer' : ''
                    }`}
                    onClick={() => hasDetails && toggleRow(entry.id)}
                  >
                    <div className="col-span-2 flex items-center gap-2">
                      {entry.isUserEdit && <Edit3 className="w-4 h-4 text-accent-primary" />}
                      <span className="text-text-primary text-sm">{entry.agent}</span>
                      {entry.isTrend && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-accent-primary/10 text-accent-primary border border-accent-primary/30">
                          Sources{entry.sourceCount ? ` ${entry.sourceCount}` : ''}
                        </span>
                      )}
                      {entry.isUserEdit && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-success/10 text-success border border-success/30">
                          Human edit
                        </span>
                      )}
                    </div>
                    <div className="col-span-2 text-text-secondary text-sm">{entry.action}</div>
                    <div className="col-span-1">
                      {entry.verdict !== '—' && (
                        <span
                          className={`px-2 py-1 rounded-full text-xs border font-medium ${getVerdictStyle(
                            entry.verdict
                          )}`}
                        >
                          {entry.verdict}
                        </span>
                      )}
                    </div>
                    <div className="col-span-2 text-text-secondary text-sm font-mono">{entry.model}</div>
                    <div className="col-span-1 text-text-secondary text-sm font-mono">{entry.duration}</div>
                    <div className="col-span-1 text-text-tertiary text-sm font-mono">{entry.timestamp}</div>
                    <div className="col-span-3 flex items-center justify-between">
                      <span className="text-text-secondary text-sm">{entry.summary}</span>
                      {hasDetails && (
                        <button className="text-text-tertiary hover:text-text-primary transition-colors">
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && hasDetails && (
                    <div className="px-6 py-4 bg-bg-primary border-t border-border-default">
                      <div className="text-sm text-text-secondary whitespace-pre-wrap">
                        {entry.summary}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}