import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, Download, ChevronDown, ChevronUp, Edit3 } from 'lucide-react';

type Filter = 'all' | 'compliance' | 'edits';
type Verdict = 'PASS' | 'REVISE' | 'REJECT';

interface AuditEntry {
  id: string;
  agent: string;
  action: string;
  verdict?: Verdict;
  model?: string;
  duration: string;
  timestamp: string;
  summary: string;
  details?: {
    flagged?: string;
    suggestion?: string;
  };
}

const AUDIT_DATA: AuditEntry[] = [
  {
    id: '1',
    agent: 'Intake',
    action: 'Brief Analysis',
    model: 'gpt-4',
    duration: '1.2s',
    timestamp: '14:32:01',
    summary: 'Analyzed content brief and extracted key requirements',
  },
  {
    id: '2',
    agent: 'Trend',
    action: 'Research',
    model: 'gpt-4',
    duration: '3.4s',
    timestamp: '14:32:03',
    summary: 'Gathered trending topics and relevant data points',
  },
  {
    id: '3',
    agent: 'Draft',
    action: 'Content Generation',
    model: 'gpt-4-turbo',
    duration: '8.7s',
    timestamp: '14:32:07',
    summary: 'Generated initial content drafts for all channels',
  },
  {
    id: '4',
    agent: 'Compliance',
    action: 'Rule Check',
    verdict: 'REVISE',
    model: 'gpt-4',
    duration: '2.1s',
    timestamp: '14:32:16',
    summary: 'Medical claim detected - requires disclaimer',
    details: {
      flagged: 'AI can diagnose diseases better than doctors',
      suggestion: 'AI assists healthcare professionals in diagnosis',
    },
  },
  {
    id: '5',
    agent: 'Compliance',
    action: 'Rule Check (Retry)',
    verdict: 'PASS',
    model: 'gpt-4',
    duration: '1.8s',
    timestamp: '14:32:18',
    summary: 'All compliance rules satisfied',
  },
  {
    id: '6',
    agent: 'user_edit',
    action: 'Manual Edit',
    model: '-',
    duration: '-',
    timestamp: '14:35:42',
    summary: 'User modified LinkedIn content',
  },
  {
    id: '7',
    agent: 'Localization',
    action: 'Translation',
    model: 'gpt-4',
    duration: '4.2s',
    timestamp: '14:32:20',
    summary: 'Translated content to Hindi with cultural adaptation',
  },
  {
    id: '8',
    agent: 'Format',
    action: 'Channel Formatting',
    model: 'gpt-3.5-turbo',
    duration: '1.5s',
    timestamp: '14:32:24',
    summary: 'Formatted content for each target channel',
  },
];

export function AuditTrail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [filter, setFilter] = useState<Filter>('all');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

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

  const filteredData = AUDIT_DATA.filter((entry) => {
    if (filter === 'all') return true;
    if (filter === 'compliance') return entry.agent === 'Compliance';
    if (filter === 'edits') return entry.agent === 'user_edit';
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

            <button className="flex items-center gap-2 px-4 py-2 bg-bg-surface border border-border-default rounded-md text-text-primary hover:bg-bg-elevated transition-colors text-sm">
              <Download className="w-4 h-4" />
              <span className="hidden md:inline">Download PDF</span>
              <span className="md:hidden">PDF</span>
            </button>
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
            {filteredData.map((entry) => {
              const isExpanded = expandedRows.has(entry.id);
              const hasDetails = entry.details && entry.verdict === 'REVISE';

              return (
                <div key={entry.id}>
                  <div
                    className={`grid grid-cols-12 gap-4 px-6 py-4 hover:bg-bg-elevated transition-colors ${
                      hasDetails ? 'cursor-pointer' : ''
                    }`}
                    onClick={() => hasDetails && toggleRow(entry.id)}
                  >
                    <div className="col-span-2 flex items-center gap-2">
                      {entry.agent === 'user_edit' && <Edit3 className="w-4 h-4 text-accent-primary" />}
                      <span className="text-text-primary text-sm">{entry.agent}</span>
                    </div>
                    <div className="col-span-2 text-text-secondary text-sm">{entry.action}</div>
                    <div className="col-span-1">
                      {entry.verdict && (
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
                  {isExpanded && entry.details && (
                    <div className="px-6 py-4 bg-bg-primary border-t border-border-default">
                      <div className="space-y-3">
                        <div>
                          <div className="text-xs text-text-tertiary mb-1">Flagged sentence:</div>
                          <div className="bg-error/10 border border-error/30 rounded p-3 text-error text-sm">
                            "{entry.details.flagged}"
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-text-tertiary mb-1">Suggested fix:</div>
                          <div className="bg-success/10 border border-success/30 rounded p-3 text-success text-sm">
                            "{entry.details.suggestion}"
                          </div>
                        </div>
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