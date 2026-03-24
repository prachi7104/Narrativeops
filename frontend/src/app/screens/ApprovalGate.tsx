import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router';
import { Twitter, Linkedin, MessageCircle, FileText, Edit3, Check, X, ArrowLeft } from 'lucide-react';

import { getOutputs, getMetrics, captureDiff, approvePipeline } from '../api/client';
import type { PipelineOutput, PipelineMetrics } from '../api/types';

type Channel = 'blog' | 'twitter' | 'linkedin' | 'whatsapp' | 'hindi';

interface ChannelContent {
  blog?: string;
  twitter?: string;
  linkedin?: string;
  whatsapp?: string;
  hindi?: string;
}

const COMPLIANCE_RULES = [
  'No financial advice',
  'No medical claims',
  'Proper citations included',
  'No misleading headlines',
  'Factual accuracy verified',
  'Appropriate tone maintained',
  'No prohibited terms',
  'Disclaimer added where required',
];

function stripHTML(value: string): string {
  return value.replace(/<[^>]*>/g, '').trim();
}

function mapOutputsToContent(outputs: PipelineOutput[]): ChannelContent {
  const blogRaw = outputs.find((o) => o.channel === 'blog' && o.language === 'en')?.content || '';
  const twitterRaw = outputs.find((o) => o.channel === 'twitter' && o.language === 'en')?.content || '[]';

  let twitterCombined = '';
  try {
    const parsed = JSON.parse(twitterRaw) as string[];
    twitterCombined = Array.isArray(parsed) ? parsed.join('\n\n') : '';
  } catch {
    twitterCombined = '';
  }

  return {
    blog: stripHTML(blogRaw),
    twitter: twitterCombined,
    linkedin: outputs.find((o) => o.channel === 'linkedin')?.content || '',
    whatsapp: outputs.find((o) => o.channel === 'whatsapp')?.content || '',
    hindi: outputs.find((o) => o.language === 'hi')?.content || '',
  };
}

export function ApprovalGate() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const contentCategory = (location.state as any)?.category || 'general';
  const [activeTab, setActiveTab] = useState<Channel>('blog');
  const [editMode, setEditMode] = useState(false);
  const [content, setContent] = useState<ChannelContent>({});
  const [editedContent, setEditedContent] = useState<ChannelContent>({});
  const [originalContent, setOriginalContent] = useState<ChannelContent>({});
  const [metrics, setMetrics] = useState<PipelineMetrics | null>(null);
  const [toast, setToast] = useState('');
  const [unsavedTabs, setUnsavedTabs] = useState<Set<Channel>>(new Set());

  useEffect(() => {
    if (!id) return;
    Promise.all([getOutputs(id), getMetrics(id)])
      .then(([outputs, loadedMetrics]) => {
        const mapped = mapOutputsToContent(outputs);
        setContent(mapped);
        setEditedContent(mapped);
        setOriginalContent(mapped);
        setMetrics(loadedMetrics);
      })
      .catch((err) => console.error('Failed to load outputs:', err));
  }, [id]);

  const handleEdit = () => {
    setEditMode(true);
  };

  const handleSave = async () => {
    if (!id) return;

    const tab = activeTab;
    const original = originalContent[tab] || '';
    const corrected = editedContent[tab] || '';

    setContent((prev) => ({ ...prev, [tab]: corrected }));

    setEditMode(false);
    setUnsavedTabs((prev) => {
      const newSet = new Set(prev);
      newSet.delete(activeTab);
      return newSet;
    });

    try {
      if (original !== corrected) {
        await captureDiff(id, tab, original, corrected, contentCategory);
        setToast('Correction captured for future drafts');
        setTimeout(() => setToast(''), 3000);
        setOriginalContent((prev) => ({ ...prev, [tab]: corrected }));
      }
    } catch (err) {
      console.error('Diff capture failed:', err);
    }
  };

  const handleCancel = () => {
    setEditMode(false);
    setEditedContent(content);
  };

  const handleContentChange = (value: string) => {
    if (activeTab === 'twitter') return;
    setEditedContent((prev) => ({
      ...prev,
      [activeTab]: value,
    }));
    setUnsavedTabs((prev) => new Set(prev).add(activeTab));
  };

  const handleApprove = async () => {
    if (!id) return;
    try {
      await approvePipeline(id);
      navigate('/pipelines');
    } catch (err) {
      console.error('Approve failed:', err);
    }
  };

  const getChannelIcon = (channel: Channel) => {
    switch (channel) {
      case 'blog':
        return FileText;
      case 'twitter':
        return Twitter;
      case 'linkedin':
        return Linkedin;
      case 'whatsapp':
        return MessageCircle;
      case 'hindi':
        return FileText;
    }
  };

  const renderContent = () => {
    const activeContent = editedContent[activeTab] || '';

    if (editMode) {
      if (activeTab === 'twitter') {
        const tweets = activeContent
          .split('\n\n')
          .map((tweet) => tweet.trim())
          .filter(Boolean);
        return (
          <div className="space-y-3">
            {tweets.map((tweet, index) => (
              <div key={index} className="bg-white text-black p-4 rounded-lg border border-gray-200">
                <div className="text-sm font-semibold mb-2">Tweet {index + 1}</div>
                <p className="whitespace-pre-wrap">{tweet}</p>
                <div className="text-xs text-gray-500 mt-2">{tweet.length} characters</div>
              </div>
            ))}
            <div className="flex gap-3 mt-6">
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-accent-primary text-white rounded-md hover:bg-accent-primary/90 transition-colors"
              >
                Save edits
              </button>
              <button
                onClick={handleCancel}
                className="px-4 py-2 text-text-secondary hover:text-text-primary transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        );
      }

      return (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex gap-4 text-xs text-text-secondary">
              <span>Word count: {activeContent.split(' ').filter(Boolean).length}</span>
              <span>Characters: {activeContent.length}</span>
            </div>
            <button
              onClick={() => setEditedContent(content)}
              className="text-xs text-accent-primary hover:underline"
            >
              Revert
            </button>
          </div>
          <textarea
            value={activeContent}
            onChange={(e) => handleContentChange(e.target.value)}
            className="w-full min-h-[400px] bg-bg-surface border border-border-emphasis rounded-md p-4 text-text-primary resize-none focus:border-accent-primary focus:outline-none"
          />
          <div className="flex gap-3 mt-4">
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-accent-primary text-white rounded-md hover:bg-accent-primary/90 transition-colors"
            >
              Save edits
            </button>
            <button
              onClick={handleCancel}
              className="px-4 py-2 text-text-secondary hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      );
    }

    // Preview mode
    if (activeTab === 'blog') {
      return (
        <div
          className="bg-white text-black p-8 rounded-lg prose max-w-none"
          dangerouslySetInnerHTML={{ __html: activeContent }}
        />
      );
    }

    if (activeTab === 'twitter') {
      const tweets = activeContent
        .split('\n\n')
        .map((tweet) => tweet.trim())
        .filter(Boolean);
      return (
        <div className="space-y-3">
          {tweets.map((tweet, index) => (
            <div key={index} className="bg-white text-black p-4 rounded-lg border border-gray-200">
              <div className="text-sm font-semibold mb-2">Tweet {index + 1}</div>
              <p className="whitespace-pre-wrap">{tweet}</p>
              <div className="text-xs text-gray-500 mt-2">{tweet.length} characters</div>
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="bg-bg-surface border border-border-default p-6 rounded-lg">
        <p className="whitespace-pre-wrap text-text-primary leading-relaxed">{activeContent}</p>
        <div className="text-xs text-text-tertiary mt-4">
          {activeContent.length} characters
        </div>
      </div>
    );
  };

  const tabs: { id: Channel; label: string }[] = [
    { id: 'blog', label: 'Blog' },
    { id: 'twitter', label: 'Twitter' },
    { id: 'linkedin', label: 'LinkedIn' },
    { id: 'whatsapp', label: 'WhatsApp' },
    { id: 'hindi', label: 'Hindi' },
  ];

  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Header */}
      <div className="border-b border-border-default">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-6">
          <div className="flex flex-col md:flex-row items-start justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <button
                  onClick={() => navigate('/')}
                  className="text-text-secondary hover:text-text-primary transition-colors"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <h2 className="text-xl md:text-2xl">Review your content</h2>
              </div>
              <p className="text-text-secondary text-sm">Pipeline complete — awaiting approval</p>
            </div>

            <div className="flex gap-3 w-full md:w-auto">
              <button
                onClick={handleApprove}
                className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 md:px-6 py-2.5 bg-success text-white rounded-md hover:bg-success/90 transition-colors font-medium"
              >
                <Check className="w-4 h-4" />
                <span className="hidden md:inline">Approve & publish</span>
                <span className="md:hidden">Approve</span>
              </button>
              <button className="flex items-center gap-2 px-4 py-2.5 text-text-secondary hover:text-error transition-colors">
                <X className="w-4 h-4" />
                <span className="hidden md:inline">Reject</span>
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-4 md:gap-6 border-b border-border-default -mb-px overflow-x-auto">
            {tabs.map((tab) => {
              const Icon = getChannelIcon(tab.id);
              const isActive = activeTab === tab.id;
              const hasUnsaved = unsavedTabs.has(tab.id);
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-1 py-3 border-b-2 transition-colors relative ${
                    isActive
                      ? 'border-accent-primary text-text-primary'
                      : 'border-transparent text-text-secondary hover:text-text-primary'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-sm font-medium">{tab.label}</span>
                  {hasUnsaved && (
                    <div className="absolute -top-1 -right-2 w-2 h-2 bg-warning rounded-full" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-8 flex flex-col lg:flex-row gap-8">
        {/* Content Area */}
        <div className="flex-1">
          {renderContent()}
          {toast && (
            <div className="mt-4 rounded-md border border-green-500/40 bg-green-500/10 px-4 py-3 text-sm text-green-500">
              {toast}
            </div>
          )}
        </div>

        {/* Right Sidebar */}
        <div className="w-full lg:w-80 space-y-6">
          {/* Edit Button */}
          {!editMode && (
            <div>
              <button
                onClick={handleEdit}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-accent-primary text-white rounded-md hover:bg-accent-primary/90 transition-colors"
              >
                <Edit3 className="w-4 h-4" />
                Edit content
              </button>
            </div>
          )}

          {/* Impact Metrics */}
          <div className="bg-bg-surface border border-border-default rounded-[--radius-md] p-4">
            <h3 className="text-text-primary mb-4 text-sm font-medium">Impact this run</h3>
            {metrics ? (
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-text-secondary">Time saved</span>
                  <span className="text-text-primary font-medium">{metrics.time_saved_display}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Cost equivalent</span>
                  <span className="text-text-primary font-medium">{metrics.cost_saved_display}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Source</span>
                  <span className="text-text-primary font-medium">
                    {metrics.brand_rules_used ? 'Custom brand rules' : 'Default rules'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Trend</span>
                  <span className="text-text-primary font-medium">
                    {metrics.trend_sources_used > 0 ? 'Grounded' : 'No live data'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="h-4 rounded bg-bg-elevated animate-pulse" />
                <div className="h-4 rounded bg-bg-elevated animate-pulse" />
                <div className="h-4 rounded bg-bg-elevated animate-pulse" />
              </div>
            )}
          </div>

          {/* Compliance Summary */}
          <div className="bg-bg-surface border border-border-default rounded-[--radius-md] p-4">
            <h3 className="text-text-primary mb-4 text-sm font-medium">Compliance summary</h3>
            <div className="space-y-2">
              {COMPLIANCE_RULES.map((rule) => (
                <div key={rule} className="flex items-start gap-2">
                  <div className="w-4 h-4 bg-success/20 rounded-full flex items-center justify-center mt-0.5 flex-shrink-0">
                    <Check className="w-3 h-3 text-success" />
                  </div>
                  <span className="text-text-secondary text-xs">{rule}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Audit Trail */}
          <div className="bg-bg-surface border border-border-default rounded-[--radius-md] p-4">
            <h3 className="text-text-primary mb-3 text-sm font-medium">Audit trail</h3>
            <button
              onClick={() => navigate(`/audit/${id}`)}
              className="text-accent-primary text-sm hover:underline"
            >
              View full audit →
            </button>
          </div>

          {/* Pipeline Stats */}
          <div className="bg-bg-surface border border-border-default rounded-[--radius-md] p-4">
            <h3 className="text-text-primary mb-4 text-sm font-medium">Pipeline stats</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-text-secondary">Total time</span>
                <span className="text-text-primary font-medium">2m 34s</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Agents used</span>
                <span className="text-text-primary font-medium">7</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Disclaimer</span>
                <span className="text-success font-medium">Added</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}