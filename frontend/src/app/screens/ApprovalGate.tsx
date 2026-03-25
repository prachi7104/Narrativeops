import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router';
import { Twitter, Linkedin, MessageCircle, FileText, Edit3, Check, X, ArrowLeft } from 'lucide-react';
import confetti from 'canvas-confetti';
import { motion } from 'motion/react';

import { getOutputs, getMetrics, captureDiff, approvePipeline, rejectPipeline, getAuditTrail } from '../api/client';
import type {
  AuditEvent,
  ComplianceAnnotation,
  ComplianceAuditSummary,
  PipelineOutput,
  PipelineMetrics,
} from '../api/types';

type Channel = 'blog' | 'faq' | 'publisher_brief' | 'op_ed' | 'explainer_box' | 'twitter' | 'linkedin' | 'whatsapp' | 'hindi';
type OutputFormat = 'et_op_ed' | 'et_explainer_box' | 'multi_platform_pack';
type OutputOption = 'et_op_ed' | 'et_explainer_box' | 'blog' | 'faq' | 'publisher_brief' | 'linkedin' | 'whatsapp' | 'twitter';

interface ChannelContent {
  blog?: string;
  faq?: string;
  publisher_brief?: string;
  op_ed?: string;
  explainer_box?: string;
  twitter?: string;
  linkedin?: string;
  whatsapp?: string;
  hindi?: string;
}

function stripHTML(value: string): string {
  return value.replace(/<[^>]*>/g, '').trim();
}

function parseComplianceSummary(events: AuditEvent[]): ComplianceAuditSummary | null {
  const event = events.find((item) => item.agent_name === 'compliance_agent');
  if (!event?.output_summary) {
    return null;
  }

  try {
    const parsed = JSON.parse(event.output_summary) as ComplianceAuditSummary;
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch {
    return {
      format: 'legacy_text',
      verdict: event.verdict || undefined,
      summary: event.output_summary,
      annotations: [],
    };
  }

  return null;
}

function getSeverity(value: string | undefined): 'error' | 'warning' | 'info' {
  if (value === 'error' || value === 'warning') {
    return value;
  }
  return 'info';
}

function mapOutputsToContent(outputs: PipelineOutput[]): ChannelContent {
  const blogRaw =
    outputs.find((o) => o.channel === 'blog' && o.language === 'en')?.content ||
    outputs.find((o) => o.channel === 'blog')?.content ||
    '';
  const twitterRaw = outputs.find((o) => o.channel === 'twitter' && o.language === 'en')?.content || '[]';

  let twitterCombined = '';
  try {
    const parsed = JSON.parse(twitterRaw) as string[];
    twitterCombined = Array.isArray(parsed) ? parsed.join('\n\n') : '';
  } catch {
    twitterCombined = '';
  }

  return {
    blog: blogRaw,
    faq: outputs.find((o) => o.channel === 'faq')?.content || '',
    publisher_brief: outputs.find((o) => o.channel === 'publisher_brief')?.content || '',
    op_ed: outputs.find((o) => o.channel === 'op_ed')?.content || '',
    explainer_box: outputs.find((o) => o.channel === 'explainer_box')?.content || '',
    twitter: twitterCombined,
    linkedin: outputs.find((o) => o.channel === 'linkedin')?.content || '',
    whatsapp: outputs.find((o) => o.channel === 'whatsapp')?.content || '',
    hindi: outputs.find((o) => o.language === 'hi')?.content || '',
  };
}

function parseFormatMetadata(events: AuditEvent[]): { format: OutputFormat; options: OutputOption[] } {
  const event = [...events].reverse().find((item) => item.agent_name === 'format_agent');
  if (!event?.output_summary) {
    return {
      format: 'multi_platform_pack',
      options: ['blog', 'twitter', 'linkedin', 'whatsapp'],
    };
  }

  try {
    const parsed = JSON.parse(event.output_summary) as {
      selected_output_format?: string;
      selected_output_options?: string[];
    };
    const format: OutputFormat =
      parsed.selected_output_format === 'et_op_ed' ||
      parsed.selected_output_format === 'et_explainer_box' ||
      parsed.selected_output_format === 'multi_platform_pack'
        ? parsed.selected_output_format
        : 'multi_platform_pack';

    const options = Array.isArray(parsed.selected_output_options)
      ? parsed.selected_output_options.filter((item): item is OutputOption => (
          item === 'et_op_ed' ||
          item === 'et_explainer_box' ||
          item === 'blog' ||
          item === 'faq' ||
          item === 'publisher_brief' ||
          item === 'linkedin' ||
          item === 'whatsapp' ||
          item === 'twitter'
        ))
      : [];

    return {
      format,
      options: options.length > 0 ? options : ['blog', 'faq', 'publisher_brief', 'twitter', 'linkedin', 'whatsapp'],
    };
  } catch {
    return {
      format: 'multi_platform_pack',
      options: ['blog', 'faq', 'publisher_brief', 'twitter', 'linkedin', 'whatsapp'],
    };
  }
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
  const [complianceSummary, setComplianceSummary] = useState<ComplianceAuditSummary | null>(null);
  const [outputOptions, setOutputOptions] = useState<OutputOption[]>(['blog', 'faq', 'publisher_brief', 'twitter', 'linkedin', 'whatsapp']);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [toast, setToast] = useState('');
  const [unsavedTabs, setUnsavedTabs] = useState<Set<Channel>>(new Set());

  const hasAnyGeneratedOutput = [
    content.blog,
    content.faq,
    content.publisher_brief,
    content.op_ed,
    content.explainer_box,
    content.twitter,
    content.linkedin,
    content.whatsapp,
    content.hindi,
  ].some((value) => (value || '').trim().length > 0);

  const loadRunData = useCallback(async (withSpinner = false) => {
    if (!id) return;
    if (withSpinner) {
      setIsRefreshing(true);
    }

    try {
      const [outputs, loadedMetrics, auditEvents] = await Promise.all([getOutputs(id), getMetrics(id), getAuditTrail(id)]);
      const mapped = mapOutputsToContent(outputs);
      setContent(mapped);
      setEditedContent(mapped);
      setOriginalContent(mapped);
      setMetrics(loadedMetrics);
      setComplianceSummary(parseComplianceSummary(auditEvents));
      const formatMeta = parseFormatMetadata(auditEvents);
      setOutputOptions(formatMeta.options);

      if (formatMeta.options.includes('et_op_ed')) {
        setActiveTab('op_ed');
      } else if (formatMeta.options.includes('et_explainer_box')) {
        setActiveTab('explainer_box');
      } else if (formatMeta.options.includes('blog')) {
        setActiveTab('blog');
      } else if (formatMeta.options.includes('twitter')) {
        setActiveTab('twitter');
      } else if (formatMeta.options.includes('linkedin')) {
        setActiveTab('linkedin');
      } else if (formatMeta.options.includes('whatsapp')) {
        setActiveTab('whatsapp');
      } else {
        setActiveTab('hindi');
      }
    } catch (err) {
      console.error('Failed to load outputs:', err);
    } finally {
      if (withSpinner) {
        setIsRefreshing(false);
      }
    }
  }, [id]);

  useEffect(() => {
    void loadRunData();
  }, [loadRunData]);

  const complianceAnnotations = (complianceSummary?.annotations || []) as ComplianceAnnotation[];
  const groupedAnnotations = complianceAnnotations.reduce(
    (acc, annotation) => {
      const severity = getSeverity(annotation.severity);
      if (!acc[severity]) {
        acc[severity] = [];
      }
      acc[severity].push(annotation);
      return acc;
    },
    { error: [] as ComplianceAnnotation[], warning: [] as ComplianceAnnotation[], info: [] as ComplianceAnnotation[] },
  );

  const severityOrder: Array<'error' | 'warning' | 'info'> = ['error', 'warning', 'info'];
  const severityLabel: Record<'error' | 'warning' | 'info', string> = {
    error: 'High severity',
    warning: 'Medium severity',
    info: 'Low severity',
  };
  const severityBadgeStyle: Record<'error' | 'warning' | 'info', string> = {
    error: 'bg-error/10 text-error border-error/30',
    warning: 'bg-warning/10 text-warning border-warning/30',
    info: 'bg-accent-primary/10 text-accent-primary border-accent-primary/30',
  };

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
        const channelForDiff = tab === 'hindi' ? 'article' : tab;
        const languageForDiff = tab === 'hindi' ? 'hi' : 'en';
        await captureDiff(
          id,
          channelForDiff,
          languageForDiff,
          original,
          corrected,
          contentCategory,
        );
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
      confetti({ particleCount: 80, spread: 70, colors: ['#7C3AED', '#06B6D4', '#10B981'] });
      setTimeout(() => navigate('/pipelines'), 1200);
    } catch (err) {
      console.error('Approve failed:', err);
    }
  };

  const handleReject = async () => {
    if (!id) return;
    try {
      await rejectPipeline(id);
      navigate('/pipelines');
    } catch (err) {
      console.error('Reject failed:', err);
    }
  };

  const getChannelIcon = (channel: Channel) => {
    switch (channel) {
      case 'blog':
        return FileText;
      case 'op_ed':
        return FileText;
      case 'explainer_box':
        return FileText;
      case 'faq':
        return FileText;
      case 'publisher_brief':
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
    if (activeTab === 'blog' || activeTab === 'faq' || activeTab === 'op_ed' || activeTab === 'explainer_box') {
      const hasHtml = /<\/?[a-z][\s\S]*>/i.test(activeContent);

      if (!activeContent.trim()) {
        const message =
          activeTab === 'op_ed'
            ? 'No ET op-ed content is available for this run yet.'
            : activeTab === 'explainer_box'
              ? 'No ET explainer box content is available for this run yet.'
              : activeTab === 'faq'
                ? 'No FAQ content is available for this run yet.'
              : 'No blog content is available for this run yet.';

        return (
          <div className="bg-bg-surface border border-border-default p-6 rounded-lg">
            <p className="text-sm text-text-secondary">
              {message}
            </p>
          </div>
        );
      }

      const label =
        activeTab === 'op_ed'
          ? 'ET Op-Ed'
          : activeTab === 'explainer_box'
            ? 'ET Explainer Box'
            : activeTab === 'faq'
              ? 'FAQ'
            : 'Blog';

      return hasHtml ? (
        <div className="bg-white text-black p-8 rounded-lg">
          <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
          <div
            className="prose max-w-none"
            dangerouslySetInnerHTML={{ __html: activeContent }}
          />
        </div>
      ) : (
        <div className="bg-bg-surface border border-border-default p-6 rounded-lg">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-tertiary">{label}</p>
          <p className="whitespace-pre-wrap text-text-primary leading-relaxed">{stripHTML(activeContent)}</p>
        </div>
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

  const tabs: { id: Channel; label: string }[] = [];

  if (outputOptions.includes('et_op_ed')) {
    tabs.push({ id: 'op_ed', label: 'ET Op-Ed' });
  }
  if (outputOptions.includes('et_explainer_box')) {
    tabs.push({ id: 'explainer_box', label: 'ET Explainer Box' });
  }
  if (outputOptions.includes('blog')) {
    tabs.push({ id: 'blog', label: 'Blog' });
  }
  if (outputOptions.includes('faq')) {
    tabs.push({ id: 'faq', label: 'FAQ' });
  }
  if (outputOptions.includes('publisher_brief')) {
    tabs.push({ id: 'publisher_brief', label: 'Publisher Brief' });
  }
  if (outputOptions.includes('twitter')) {
    tabs.push({ id: 'twitter', label: 'Twitter' });
  }
  if (outputOptions.includes('linkedin')) {
    tabs.push({ id: 'linkedin', label: 'LinkedIn' });
  }
  if (outputOptions.includes('whatsapp')) {
    tabs.push({ id: 'whatsapp', label: 'WhatsApp' });
  }
  if ((content.hindi || '').trim()) {
    tabs.push({ id: 'hindi', label: 'Hindi' });
  }

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
              <button onClick={handleReject} className="flex items-center gap-2 px-4 py-2.5 text-text-secondary hover:text-error transition-colors">
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
          {!hasAnyGeneratedOutput && (
            <div className="mb-4 rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
              <p className="font-medium">No generated outputs found for this run yet.</p>
              <p className="mt-1 text-xs text-text-secondary">
                This can happen for older runs or when a run escalates before formatting. Try refreshing outputs.
              </p>
              <button
                onClick={() => void loadRunData(true)}
                className="mt-3 rounded border border-warning/40 px-3 py-1.5 text-xs text-warning hover:bg-warning/20 transition-colors"
              >
                {isRefreshing ? 'Refreshing...' : 'Refresh outputs'}
              </button>
            </div>
          )}

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
            {!complianceSummary ? (
              <p className="text-xs text-text-secondary">Compliance details are not available for this run yet.</p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-secondary">Verdict</span>
                  <span className="text-text-primary font-medium">{complianceSummary.verdict || 'N/A'}</span>
                </div>
                {complianceSummary.summary && (
                  <p className="text-xs text-text-secondary">{complianceSummary.summary}</p>
                )}
                {complianceAnnotations.length > 0 ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {severityOrder.map((severity) => {
                        const count = groupedAnnotations[severity].length;
                        if (count === 0) {
                          return null;
                        }
                        return (
                          <span
                            key={severity}
                            className={`rounded-full border px-2 py-1 text-[11px] ${severityBadgeStyle[severity]}`}
                          >
                            {severityLabel[severity]}: {count}
                          </span>
                        );
                      })}
                    </div>

                    {severityOrder.map((severity) => {
                      const items = groupedAnnotations[severity];
                      if (items.length === 0) {
                        return null;
                      }

                      return (
                        <div key={severity} className="space-y-2">
                          <p className="text-[11px] font-medium uppercase tracking-wide text-text-tertiary">
                            {severityLabel[severity]}
                          </p>
                          {items.map((annotation, index) => (
                            <div
                              key={`annotation-${severity}-${index}`}
                              className="rounded-md border border-border-default bg-bg-primary p-2"
                            >
                              <div className="mb-1 flex items-center gap-2">
                                <span className={`rounded-full border px-2 py-0.5 text-[10px] ${severityBadgeStyle[severity]}`}>
                                  {severity.toUpperCase()}
                                </span>
                                {annotation.rule_id && (
                                  <span className="text-[10px] text-text-tertiary">{annotation.rule_id}</span>
                                )}
                              </div>
                              <p className="text-xs text-text-primary">{annotation.message || 'Compliance check'}</p>
                              {annotation.sentence && (
                                <p className="mt-1 text-[11px] text-text-tertiary">Sentence: "{annotation.sentence}"</p>
                              )}
                              {annotation.suggested_fix && (
                                <p className="mt-1 text-[11px] text-accent-primary">Suggested fix: {annotation.suggested_fix}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-success">No compliance violations found.</p>
                )}
              </div>
            )}
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
                <span className="text-text-primary font-medium">{metrics?.total_duration_display ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Compliance iterations</span>
                <span className="text-text-primary font-medium">{metrics?.compliance_iterations ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Trend sources</span>
                <span className="text-text-primary font-medium">{metrics?.trend_sources_used ?? 0}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}