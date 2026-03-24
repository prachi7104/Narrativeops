import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Twitter, Linkedin, MessageCircle, FileText, ArrowRight } from 'lucide-react';

import { getDashboardSummary, getStyleMemory } from '../api/client';
import type { DashboardSummary, StyleMemoryResponse } from '../api/types';

const CHANNEL_OPTIONS = [
  { id: 'blog', label: 'Blog', icon: FileText },
  { id: 'twitter', label: 'Twitter', icon: Twitter },
  { id: 'linkedin', label: 'LinkedIn', icon: Linkedin },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
];

const QUICK_SELECT = ['Article', 'Social Campaign', 'Product Launch'];

const TRENDING_TOPICS = [
  'AI in Healthcare',
  'Sustainable Energy',
  'Remote Work Culture',
  'Crypto Regulations',
  'EdTech Innovation',
];

const STATIC_TRENDING_TOPICS = [...TRENDING_TOPICS];

export function Dashboard() {
  const navigate = useNavigate();
  const [brief, setBrief] = useState('');
  const [selectedChannels, setSelectedChannels] = useState<string[]>(['blog']);
  const [language, setLanguage] = useState<'EN' | 'HI'>('EN');
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [styleMemory, setStyleMemory] = useState<StyleMemoryResponse | null>(null);

  useEffect(() => {
    Promise.all([getDashboardSummary(), getStyleMemory(20)])
      .then(([summaryData, memoryData]) => {
        setSummary(summaryData);
        setStyleMemory(memoryData);
      })
      .catch(console.error);
  }, []);

  const trendingTopics = useMemo(() => {
    const recentTopics = summary?.most_recent_runs
      ?.map((run) => run.brief_topic)
      .filter((topic) => Boolean(topic && topic.trim()))
      .slice(0, 5);
    return recentTopics && recentTopics.length > 0 ? recentTopics : STATIC_TRENDING_TOPICS;
  }, [summary]);

  const formatTimeAgo = (createdAt: string) => {
    const parsed = new Date(createdAt);
    const diffMs = Date.now() - parsed.getTime();
    if (Number.isNaN(diffMs) || diffMs < 0) return 'just now';
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  };

  const toggleChannel = (channelId: string) => {
    setSelectedChannels((prev) =>
      prev.includes(channelId)
        ? prev.filter((c) => c !== channelId)
        : [...prev, channelId]
    );
  };

  const handleRunPipeline = () => {
    navigate('/configure', { state: { prefillBrief: brief } });
  };

  const getChannelIcon = (channelId: string) => {
    const channel = CHANNEL_OPTIONS.find((c) => c.id === channelId);
    return channel?.icon || FileText;
  };

  const getComplianceBadgeStyle = (status: string) => {
    switch (status) {
      case 'PASS':
        return 'bg-success/10 text-success border-success/30';
      case 'REVISE':
        return 'bg-warning/10 text-warning border-warning/30';
      case 'FAIL':
        return 'bg-error/10 text-error border-error/30';
      default:
        return 'bg-text-tertiary/10 text-text-tertiary border-text-tertiary/30';
    }
  };

  const mapStatusToCompliance = (status: string) => {
    if (status === 'completed') return 'PASS';
    if (status === 'awaiting_approval' || status === 'running') return 'REVISE';
    return 'FAIL';
  };

  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Top Navigation */}
      <nav className="h-16 border-b border-border-default px-4 md:px-6 flex items-center justify-between">
        <div className="text-text-primary font-semibold">NarrativeOps</div>
        <div className="flex items-center gap-3 md:gap-4">
          <button
            onClick={() => navigate('/configure')}
            className="px-3 md:px-4 py-2 bg-accent-primary text-white rounded-md hover:bg-accent-primary/90 transition-colors text-sm md:text-base"
          >
            New pipeline
          </button>
          <div className="w-8 h-8 bg-accent-secondary rounded-full flex items-center justify-center text-white text-sm font-medium">
            U
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-[1440px] mx-auto px-4 md:px-6 py-8 md:py-12">
        {/* Hero Input Section */}
        <div className="max-w-3xl mx-auto mb-8 md:mb-12">
          <div className="glass rounded-[--radius-md] p-4 md:p-8">
            {/* Textarea */}
            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="Describe your content brief..."
              className="w-full min-h-[120px] bg-transparent border border-border-default rounded-md p-3 md:p-4 text-text-primary placeholder:text-text-tertiary resize-none focus:border-border-emphasis focus:outline-none transition-colors"
            />

            {/* Quick Select Chips */}
            <div className="flex flex-wrap gap-2 mt-4">
              {QUICK_SELECT.map((chip) => (
                <button
                  key={chip}
                  onClick={() => setBrief(chip)}
                  className="px-3 md:px-4 py-2 rounded-full border border-border-default text-text-secondary text-sm hover:border-accent-primary hover:text-accent-primary transition-colors"
                >
                  {chip}
                </button>
              ))}
            </div>

            {/* Channel Toggles */}
            <div className="flex flex-wrap gap-2 md:gap-4 mt-6">
              {CHANNEL_OPTIONS.map((channel) => {
                const Icon = channel.icon;
                const isSelected = selectedChannels.includes(channel.id);
                return (
                  <button
                    key={channel.id}
                    onClick={() => toggleChannel(channel.id)}
                    className={`flex items-center gap-2 px-3 md:px-4 py-2 rounded-md border transition-colors ${
                      isSelected
                        ? 'bg-accent-primary/10 border-accent-primary text-accent-primary'
                        : 'border-border-default text-text-secondary hover:border-text-secondary'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-sm">{channel.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Bottom Row */}
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 mt-6">
              {/* Language Toggle */}
              <div className="flex gap-1 bg-bg-surface rounded-md p-1">
                <button
                  onClick={() => setLanguage('EN')}
                  className={`flex-1 md:flex-initial px-4 py-1.5 rounded text-sm transition-colors ${
                    language === 'EN'
                      ? 'bg-accent-primary text-white'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  EN
                </button>
                <button
                  onClick={() => setLanguage('HI')}
                  className={`flex-1 md:flex-initial px-4 py-1.5 rounded text-sm transition-colors ${
                    language === 'HI'
                      ? 'bg-accent-primary text-white'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  HI
                </button>
              </div>

              {/* Run Pipeline CTA */}
              <button
                onClick={handleRunPipeline}
                className="w-full md:w-auto px-6 py-2.5 bg-accent-primary text-white rounded-md hover:bg-accent-primary/90 transition-colors font-medium"
              >
                Run pipeline
              </button>
            </div>
          </div>
        </div>

        {summary && summary.total_runs > 0 && (
          <div className="max-w-3xl mx-auto mb-8 md:mb-12">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
              <div className="bg-bg-surface border border-border-default rounded-[--radius-md] p-4">
                <p className="text-xs text-text-secondary mb-1">Hours saved</p>
                <p className="text-text-primary text-lg font-semibold">
                  {summary.total_time_saved_hours.toFixed(1)}h
                </p>
              </div>
              <div className="bg-bg-surface border border-border-default rounded-[--radius-md] p-4">
                <p className="text-xs text-text-secondary mb-1">Cost saved</p>
                <p className="text-text-primary text-lg font-semibold">
                  ₹{summary.total_cost_saved_inr.toLocaleString('en-IN')}
                </p>
              </div>
              <div className="bg-bg-surface border border-border-default rounded-[--radius-md] p-4">
                <p className="text-xs text-text-secondary mb-1">Corrections</p>
                <p className="text-text-primary text-lg font-semibold">
                  {summary.total_corrections_captured} captured
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Trending Topics */}
        <div className="max-w-3xl mx-auto mb-8 md:mb-12">
          <p className="text-xs text-text-secondary mb-3">Trending in your category</p>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {trendingTopics.map((topic) => (
              <button
                key={topic}
                onClick={() => navigate('/configure', { state: { prefillBrief: topic } })}
                className="px-4 py-2 rounded-full bg-bg-surface text-text-secondary text-sm whitespace-nowrap hover:bg-bg-elevated hover:text-text-primary transition-colors"
              >
                {topic}
              </button>
            ))}
          </div>
        </div>

        {/* Recent Pipelines */}
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl md:text-2xl">Recent pipelines</h2>
            <button
              onClick={() => navigate('/pipelines')}
              className="flex items-center gap-1 text-accent-primary text-sm hover:gap-2 transition-all"
            >
              View all <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {summary?.most_recent_runs && summary.most_recent_runs.length > 0
              ? summary.most_recent_runs.map((run) => (
                  <div
                    key={run.id}
                    onClick={() => navigate(run.status === 'awaiting_approval' ? `/approval/${run.id}` : `/audit/${run.id}`)}
                    className="bg-bg-surface border border-border-default rounded-[--radius-md] p-6 hover:border-accent-primary/40 cursor-pointer transition-colors"
                  >
                    <p className="text-text-primary mb-4 line-clamp-2 leading-relaxed">
                      {run.brief_topic}
                    </p>

                    <div className="flex gap-2 mb-4">
                      {['blog', 'twitter', 'linkedin'].map((channelId) => {
                        const Icon = getChannelIcon(channelId);
                        return (
                          <div
                            key={channelId}
                            className="w-8 h-8 bg-bg-elevated rounded-md flex items-center justify-center"
                          >
                            <Icon className="w-4 h-4 text-text-secondary" />
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex items-center justify-between">
                      <span
                        className={`px-3 py-1 rounded-full text-xs border font-medium ${getComplianceBadgeStyle(
                          mapStatusToCompliance(run.status)
                        )}`}
                      >
                        {run.status}
                      </span>
                      <span className="text-xs text-text-tertiary">{formatTimeAgo(run.created_at)}</span>
                    </div>
                  </div>
                ))
              : (
                <div className="md:col-span-3 rounded-[--radius-md] border border-dashed border-border-default bg-bg-surface p-8 text-center text-sm text-text-secondary">
                  No completed or pending runs yet. Start a new pipeline to populate your archive.
                </div>
                )}
          </div>

          <div className="mt-8 rounded-[--radius-md] border border-border-default bg-bg-surface p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg">Style memory</h3>
              <span className="text-xs text-text-secondary">
                {styleMemory?.total ?? 0} corrections captured
              </span>
            </div>
            {!styleMemory || styleMemory.categories.length === 0 ? (
              <p className="text-sm text-text-secondary">
                No editorial corrections captured yet. Corrections from approvals will appear here.
              </p>
            ) : (
              <div className="space-y-4">
                {styleMemory.categories.map((category) => {
                  const entries = styleMemory.by_category[category] || [];
                  return (
                    <div key={category} className="rounded-md border border-border-default bg-bg-primary p-4">
                      <p className="text-sm font-medium text-text-primary">
                        {category} content ({entries.length} corrections)
                      </p>
                      <ul className="mt-2 space-y-1 text-xs text-text-secondary">
                        {entries.slice(0, 3).map((entry, idx) => (
                          <li key={`${category}-${idx}`} className="line-clamp-1">• {entry}</li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}