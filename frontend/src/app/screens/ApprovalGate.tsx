import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router';
import { Twitter, Linkedin, MessageCircle, FileText, Edit3, ArrowLeft } from 'lucide-react';
import confetti from 'canvas-confetti';
import { motion, useAnimation, useMotionValue, useTransform } from 'motion/react';
import DOMPurify from 'dompurify';

import {
  getOutputs,
  getMetrics,
  getPipelineStatus,
  captureDiff,
  approvePipeline,
  rejectPipeline,
  getAuditTrail,
  getPipelineStrategy,
} from '../api/client';
import type {
  AuditEvent,
  ComplianceAnnotation,
  ComplianceAuditSummary,
  EngagementStrategyResponse,
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

  const hindiArticle = outputs.find((o) => o.channel === 'article' && o.language === 'hi')?.content || '';
  const hindiWhatsapp = outputs.find((o) => o.channel === 'whatsapp' && o.language === 'hi')?.content || '';
  const hindiContent = hindiArticle
    ? `${hindiArticle}\n\n---\n📱 WhatsApp variant (Hindi):\n\n${hindiWhatsapp}`
    : hindiWhatsapp;

  return {
    blog: blogRaw,
    faq: outputs.find((o) => o.channel === 'faq')?.content || '',
    publisher_brief: outputs.find((o) => o.channel === 'publisher_brief')?.content || '',
    op_ed: outputs.find((o) => o.channel === 'op_ed')?.content || '',
    explainer_box: outputs.find((o) => o.channel === 'explainer_box')?.content || '',
    twitter: twitterCombined,
    linkedin: outputs.find((o) => o.channel === 'linkedin')?.content || '',
    whatsapp: outputs.find((o) => o.channel === 'whatsapp' && o.language === 'en')?.content || '',
    hindi: hindiContent,
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
  const [contentCategory, setContentCategory] = useState<string>(
    String((location.state as { category?: string } | null)?.category || 'general'),
  );
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
  const [engagementStrategy, setEngagementStrategy] = useState<EngagementStrategyResponse | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [swipeLocked, setSwipeLocked] = useState(false);
  const swipeX = useMotionValue(0);
  const swipeControls = useAnimation();
  const approveOverlayOpacity = useTransform(swipeX, [20, 180], [0, 1]);
  const rejectOverlayOpacity = useTransform(swipeX, [-20, -180], [0, 1]);

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

  const slowestAgentTiming = metrics?.agent_timing?.reduce((slowest, current) => {
    if (!slowest || current.duration_ms > slowest.duration_ms) {
      return current;
    }
    return slowest;
  }, undefined as PipelineMetrics['agent_timing'] extends Array<infer T> ? T | undefined : undefined);

  const loadRunData = useCallback(async (withSpinner = false) => {
    if (!id) return;
    if (withSpinner) {
      setIsRefreshing(true);
    }

    try {
      const [outputs, loadedMetrics, auditEvents, strategy, statusResponse] = await Promise.all([
        getOutputs(id),
        getMetrics(id),
        getAuditTrail(id),
        getPipelineStrategy(id).catch(() => null),
        getPipelineStatus(id).catch(() => null),
      ]);
      const mapped = mapOutputsToContent(outputs);
      setContent(mapped);
      setEditedContent(mapped);
      setOriginalContent(mapped);
      setMetrics(loadedMetrics);
      setComplianceSummary(parseComplianceSummary(auditEvents));
      setEngagementStrategy(strategy);
      const formatMeta = parseFormatMetadata(auditEvents);
      setOutputOptions(formatMeta.options);

      const briefJson = (statusResponse?.brief_json || {}) as Record<string, unknown>;
      const fetchedCategory = String(briefJson.content_category || '').trim();
      if (fetchedCategory) {
        setContentCategory(fetchedCategory);
      }

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
      setTimeout(() => navigate(`/audit/${id}`), 1400);
    } catch (err) {
      console.error('Approve failed:', err);
    }
  };

  const handleReject = async () => {
    if (!id) return;
    if (!rejectionReason.trim()) return;
    try {
      await rejectPipeline(id, rejectionReason.trim());
      setRejectDialogOpen(false);
      setRejectionReason('');
      navigate('/pipelines');
    } catch (err) {
      console.error('Reject failed:', err);
    }
  };

  const openRejectDialog = () => {
    setRejectDialogOpen(true);
    setSwipeLocked(false);
    swipeX.set(0);
    void swipeControls.start({ x: 0, opacity: 1, transition: { duration: 0.2 } });
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
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(activeContent, {
                ALLOWED_TAGS: [
                  'p', 'br', 'strong', 'em', 'b', 'i', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                  'ul', 'ol', 'li', 'blockquote', 'article', 'section', 'header', 'footer',
                  'div', 'span', 'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
                ],
                ALLOWED_ATTR: ['href', 'class', 'id', 'target', 'rel'],
                ALLOW_DATA_ATTR: false,
              }),
            }}
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
              <p className="text-text-secondary text-sm">Pipeline complete, awaiting your decision.</p>
              <p className="text-text-secondary text-xs mt-1">Lumina: Enterprise content, on autopilot.</p>
              <p className="text-xs text-text-tertiary mt-2">Swipe right to approve. Swipe left to send back for rewrite.</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="relative">
            <div className="flex gap-4 md:gap-6 border-b border-border-default -mb-px overflow-x-auto pr-6">
              {tabs.map((tab) => {
                const Icon = getChannelIcon(tab.id);
                const isActive = activeTab === tab.id;
                const hasUnsaved = unsavedTabs.has(tab.id);
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-1 py-3 border-b-2 transition-colors relative whitespace-nowrap ${
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
            <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-bg-primary to-transparent" />
            <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-bg-primary to-transparent" />
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

          {!editMode ? (
            <div className="relative">
              <motion.div
                style={{ opacity: approveOverlayOpacity }}
                className="pointer-events-none absolute right-5 top-5 z-20 rounded-full border border-success/40 bg-success/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-success"
              >
                Approve
              </motion.div>
              <motion.div
                style={{ opacity: rejectOverlayOpacity }}
                className="pointer-events-none absolute left-5 top-5 z-20 rounded-full border border-warning/40 bg-warning/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-warning"
              >
                Rewrite
              </motion.div>

              <motion.div
                drag={swipeLocked ? false : 'x'}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.18}
                style={{ x: swipeX }}
                animate={swipeControls}
                onDragEnd={async (_, info) => {
                  if (swipeLocked) return;

                  if (info.offset.x > 150) {
                    setSwipeLocked(true);
                    await swipeControls.start({ x: 360, opacity: 0, transition: { duration: 0.22 } });
                    await handleApprove();
                    return;
                  }

                  if (info.offset.x < -150) {
                    setSwipeLocked(true);
                          openRejectDialog();
                    return;
                  }

                  void swipeControls.start({ x: 0, transition: { type: 'spring', stiffness: 320, damping: 24 } });
                }}
                className="cursor-grab active:cursor-grabbing"
              >
                {renderContent()}
              </motion.div>
            </div>
          ) : (
            renderContent()
          )}
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
                  <span className="text-text-secondary">Measured runtime</span>
                  <span className="text-text-primary font-medium">{metrics.actual_duration_display}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Manual baseline</span>
                  <span className="text-text-primary font-medium">{metrics.baseline_manual_hours} hours</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Time saved</span>
                  <span className="text-text-primary font-medium">{metrics.time_saved_display}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Cost equivalent</span>
                  <span className="text-text-primary font-medium">{metrics.cost_saved_display}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Rules used</span>
                  <span className="text-text-primary font-medium">
                    {metrics.rules_source_label || (metrics.brand_rules_used ? 'Custom brand rules' : 'Default rules')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Trend</span>
                  <span className="text-text-primary font-medium">
                    {metrics.trend_sources_used > 0 ? 'Grounded' : 'No live data'}
                  </span>
                </div>
                {metrics.estimated_llm_cost_usd !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-text-secondary">LLM cost</span>
                    <span className="text-text-primary font-medium">
                      ~${metrics.estimated_llm_cost_usd.toFixed(3)} USD
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="h-4 rounded bg-bg-elevated animate-pulse" />
                <div className="h-4 rounded bg-bg-elevated animate-pulse" />
                <div className="h-4 rounded bg-bg-elevated animate-pulse" />
              </div>
            )}
          </div>

          {metrics && metrics.compliance_iterations > 1 && (
            <div className="bg-warning/5 border border-warning/20 rounded-md p-3 mt-2">
              <p className="text-xs text-text-secondary">
                Compliance auto-corrected <strong>{metrics.compliance_iterations} time{metrics.compliance_iterations > 1 ? 's' : ''}</strong> before passing.
                <br />This draft was autonomously revised without human intervention.
              </p>
            </div>
          )}

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

          {/* Engagement Strategy */}
          {engagementStrategy && (
            <div className="bg-bg-surface border border-border-default rounded-[--radius-md] p-4">
              <h3 className="text-text-primary mb-4 text-sm font-medium">Engagement strategy</h3>
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary">Pivot recommendation</span>
                  <span
                    className={`rounded-full border px-2 py-0.5 font-medium ${
                      engagementStrategy.pivot_recommended
                        ? 'border-warning/30 text-warning bg-warning/10'
                        : 'border-success/30 text-success bg-success/10'
                    }`}
                  >
                    {engagementStrategy.pivot_recommended ? 'Recommended' : 'Not needed'}
                  </span>
                </div>
                {engagementStrategy.pivot_reason && (
                  <p className="text-text-secondary">{engagementStrategy.pivot_reason}</p>
                )}
                {engagementStrategy.strategy_recommendation && (
                  <p className="text-text-primary">{engagementStrategy.strategy_recommendation}</p>
                )}

                {engagementStrategy.content_calendar && engagementStrategy.content_calendar.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-text-tertiary">Content calendar</p>
                    {engagementStrategy.content_calendar.slice(0, 2).map((weekBlock) => (
                      <div key={weekBlock.week} className="rounded-md border border-border-default bg-bg-primary p-2">
                        <p className="text-text-primary font-medium mb-1">Week {weekBlock.week}</p>
                        <div className="space-y-1">
                          {weekBlock.items.slice(0, 3).map((item, idx) => (
                            <p key={`${weekBlock.week}-${idx}`} className="text-text-secondary">
                              {item.channel}: {item.topic}
                            </p>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

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
              {slowestAgentTiming && (
                <div className="flex justify-between">
                  <span className="text-text-secondary">Slowest agent</span>
                  <span className="text-text-primary font-medium">
                    {slowestAgentTiming.agent} ({Math.round(slowestAgentTiming.duration_ms / 1000)}s)
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {rejectDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            aria-label="Close rejection dialog"
            className="absolute inset-0 bg-black/50"
            onClick={() => setRejectDialogOpen(false)}
          />
          <div className="relative w-full max-w-lg rounded-lg border border-border-default bg-bg-surface p-5 shadow-xl">
            <h3 className="text-text-primary text-lg mb-2">Send back for rewrite</h3>
            <p className="text-sm text-text-secondary mb-3">
              Add a clear reason so the next draft can address this feedback.
            </p>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Example: Tone is too promotional. Keep claims factual and include source-backed numbers."
              className="w-full min-h-[130px] bg-bg-primary border border-border-default rounded-md p-3 text-text-primary resize-none focus:border-warning focus:outline-none"
            />
            <div className="mt-4 flex items-center justify-end gap-3">
              <button
                onClick={() => setRejectDialogOpen(false)}
                className="px-4 py-2 rounded-md text-text-secondary hover:text-text-primary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={!rejectionReason.trim()}
                className="px-4 py-2 rounded-md bg-warning text-black hover:bg-warning/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Reject and rewrite
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}