import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Search, Filter, Eye, RotateCw, Trash2, Twitter, Linkedin, MessageCircle, FileText } from 'lucide-react';
import { listRuns } from '../../api/client';
import type { RunSummary } from '../../api/types';

type PipelineStatus = 'completed' | 'awaiting' | 'failed' | 'escalated';
type ComplianceStatus = 'PASS' | 'REVISE' | 'FAIL';

interface DisplayPipeline {
  id: string;
  topic: string;
  channels: string[];
  compliance: ComplianceStatus;
  language: string;
  created: string;
  status: PipelineStatus;
  rawStatus: RunSummary['status'];
}

export function MyPipelines() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [pipelines, setPipelines] = useState<DisplayPipeline[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listRuns(50)
      .then((runs: RunSummary[]) => {
        // Map API data to display format
        const displayPipelines: DisplayPipeline[] = runs.map((run) => {
          // Map status to DisplayPipeline status
          let displayStatus: PipelineStatus = 'completed';
          if (run.status === 'awaiting_approval') displayStatus = 'awaiting';
          else if (run.status === 'failed') displayStatus = 'failed';
          else if (run.status === 'escalated') displayStatus = 'escalated';
          else if (run.status === 'completed') displayStatus = 'completed';

          // Format timestamp
          let createdDisplay = 'Unknown';
          try {
            const date = new Date(run.created_at);
            const now = new Date();
            const diffMs = now.getTime() - date.getTime();
            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

            if (diffHours < 1) createdDisplay = 'Just now';
            else if (diffHours < 24) createdDisplay = `${diffHours} hours ago`;
            else if (diffDays === 1) createdDisplay = '1 day ago';
            else createdDisplay = `${diffDays} days ago`;
          } catch {
            createdDisplay = run.created_at;
          }

          return {
            id: run.id,
            topic: run.brief_topic || 'Untitled',
            channels: ['blog', 'twitter', 'linkedin'], // Default channels
            compliance: 'PASS' as ComplianceStatus, // Default compliance
            language: 'EN', // Default language
            created: createdDisplay,
            status: displayStatus,
            rawStatus: run.status,
          };
        });
        setPipelines(displayPipelines);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load pipelines:', err);
        setLoading(false);
      });
  }, []);

  const getChannelIcon = (channelId: string) => {
    switch (channelId) {
      case 'blog':
        return FileText;
      case 'twitter':
        return Twitter;
      case 'linkedin':
        return Linkedin;
      case 'whatsapp':
        return MessageCircle;
      default:
        return FileText;
    }
  };

  const getStatusStyle = (status: PipelineStatus) => {
    switch (status) {
      case 'completed':
        return 'bg-success/10 text-success border-success/30';
      case 'awaiting':
        return 'bg-accent-primary/10 text-accent-primary border-accent-primary/30';
      case 'failed':
        return 'bg-error/10 text-error border-error/30';
      case 'escalated':
        return 'bg-warning/10 text-warning border-warning/30';
    }
  };

  const getStatusLabel = (status: PipelineStatus) => {
    switch (status) {
      case 'completed':
        return 'Completed';
      case 'awaiting':
        return 'Awaiting approval';
      case 'failed':
        return 'Failed';
      case 'escalated':
        return 'Escalated';
    }
  };

  const getComplianceStyle = (compliance: ComplianceStatus) => {
    switch (compliance) {
      case 'PASS':
        return 'bg-success/10 text-success border-success/30';
      case 'REVISE':
        return 'bg-warning/10 text-warning border-warning/30';
      case 'FAIL':
        return 'bg-error/10 text-error border-error/30';
    }
  };

  const filteredPipelines = pipelines.filter((pipeline) =>
    pipeline.topic.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getRouteForPipeline = (pipeline: DisplayPipeline) => {
    if (pipeline.rawStatus === 'awaiting_approval') {
      return `/approval/${pipeline.id}`;
    }
    if (pipeline.rawStatus === 'completed') {
      return `/audit/${pipeline.id}`;
    }
    return `/audit/${pipeline.id}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center">
        <div className="text-text-secondary">Loading pipelines...</div>
      </div>
    );
  }

  if (filteredPipelines.length === 0 && searchQuery === '' && pipelines.length === 0) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-32 h-32 mx-auto mb-6 bg-bg-surface rounded-full flex items-center justify-center">
            <FileText className="w-16 h-16 text-text-tertiary" />
          </div>
          <h2 className="mb-2">No pipelines yet</h2>
          <p className="text-text-secondary mb-6">
            Create your first content pipeline to get started
          </p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-2.5 bg-accent-primary text-white rounded-md hover:bg-accent-primary/90 transition-colors font-medium"
          >
            Create your first pipeline
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Header */}
      <div className="border-b border-border-default">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/')}
                className="text-text-secondary hover:text-text-primary transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="text-xl md:text-2xl">My pipelines</h2>
            </div>

            <button
              onClick={() => navigate('/')}
              className="w-full md:w-auto px-4 py-2 bg-accent-primary text-white rounded-md hover:bg-accent-primary/90 transition-colors"
            >
              New pipeline
            </button>
          </div>

          {/* Search and Filter */}
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search pipelines..."
                className="w-full pl-10 pr-4 py-2 bg-bg-surface border border-border-default rounded-md text-text-primary placeholder:text-text-tertiary focus:border-accent-primary focus:outline-none transition-colors"
              />
            </div>
            <button className="flex items-center gap-2 px-4 py-2 bg-bg-surface border border-border-default rounded-md text-text-secondary hover:text-text-primary transition-colors">
              <Filter className="w-4 h-4" />
              Filter
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="bg-bg-surface border border-border-default rounded-[--radius-md] overflow-hidden">
          {/* Table Header */}
          <div className="grid grid-cols-12 gap-4 px-6 py-4 border-b border-border-default bg-bg-elevated text-text-secondary text-xs font-medium uppercase tracking-wider">
            <div className="col-span-3">Topic</div>
            <div className="col-span-2">Channels</div>
            <div className="col-span-1">Compliance</div>
            <div className="col-span-1">Language</div>
            <div className="col-span-2">Created</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-1">Actions</div>
          </div>

          {/* Table Body */}
          <div className="divide-y divide-border-default">
            {filteredPipelines.map((pipeline) => (
              <div
                key={pipeline.id}
                onClick={() => navigate(getRouteForPipeline(pipeline))}
                onMouseEnter={() => setHoveredRow(pipeline.id)}
                onMouseLeave={() => setHoveredRow(null)}
                className="grid grid-cols-12 gap-4 px-6 py-4 hover:bg-bg-elevated transition-colors cursor-pointer"
              >
                <div className="col-span-3 text-text-primary text-sm">{pipeline.topic}</div>

                <div className="col-span-2 flex gap-2">
                  {pipeline.channels.map((channelId) => {
                    const Icon = getChannelIcon(channelId);
                    return (
                      <div
                        key={channelId}
                        className="w-8 h-8 bg-bg-primary rounded-md flex items-center justify-center"
                        title={channelId}
                      >
                        <Icon className="w-4 h-4 text-text-secondary" />
                      </div>
                    );
                  })}
                </div>

                <div className="col-span-1">
                  <span
                    className={`px-2 py-1 rounded-full text-xs border font-medium ${getComplianceStyle(
                      pipeline.compliance
                    )}`}
                  >
                    {pipeline.compliance}
                  </span>
                </div>

                <div className="col-span-1 text-text-secondary text-sm">{pipeline.language}</div>

                <div className="col-span-2 text-text-tertiary text-sm">{pipeline.created}</div>

                <div className="col-span-2">
                  <span
                    className={`px-3 py-1 rounded-full text-xs border font-medium ${getStatusStyle(
                      pipeline.status
                    )}`}
                  >
                    {getStatusLabel(pipeline.status)}
                  </span>
                </div>

                <div className="col-span-1">
                  {hoveredRow === pipeline.id && (
                    <div className="flex gap-2">
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          navigate(getRouteForPipeline(pipeline));
                        }}
                        className="text-text-secondary hover:text-accent-primary transition-colors"
                        title="View"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          navigate('/configure');
                        }}
                        className="text-text-secondary hover:text-accent-primary transition-colors"
                        title="Re-run"
                      >
                        <RotateCw className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(event) => event.stopPropagation()}
                        className="text-text-secondary hover:text-error transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}