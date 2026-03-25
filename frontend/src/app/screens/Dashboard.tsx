import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import {
  FileText,
  Twitter,
  Linkedin,
  MessageCircle,
  Newspaper,
  HelpCircle,
  Clock,
  IndianRupee,
  CheckCircle,
  Edit3,
  ArrowRight,
  X,
  Upload,
} from 'lucide-react';

import {
  getDashboardSummary,
  getStyleMemory,
  startPipeline,
  uploadBrandGuide,
} from '../api/client';
import type { DashboardSummary, StyleMemoryResponse } from '../api/types';

/* ------------------------------------------------------------------ */
/*  Template tile definitions                                         */
/* ------------------------------------------------------------------ */

interface TemplateTile {
  id: string;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement> & { className?: string }>;
  borderGradient: string;
  outputOptions: string[];
  category: string;
}

const TEMPLATE_TILES: TemplateTile[] = [
  {
    id: 'blog',
    label: 'Blog Post',
    icon: FileText,
    borderGradient: 'linear-gradient(90deg, #7C3AED, #8B5CF6)',
    outputOptions: ['blog'],
    category: 'blog',
  },
  {
    id: 'twitter',
    label: 'Twitter Thread',
    icon: Twitter,
    borderGradient: 'linear-gradient(90deg, #06B6D4, #22D3EE)',
    outputOptions: ['twitter'],
    category: 'social',
  },
  {
    id: 'linkedin',
    label: 'LinkedIn Post',
    icon: Linkedin,
    borderGradient: 'linear-gradient(90deg, #2563EB, #3B82F6)',
    outputOptions: ['linkedin'],
    category: 'social',
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp Update',
    icon: MessageCircle,
    borderGradient: 'linear-gradient(90deg, #16A34A, #22C55E)',
    outputOptions: ['whatsapp'],
    category: 'messaging',
  },
  {
    id: 'op_ed',
    label: 'ET Op-Ed',
    icon: Newspaper,
    borderGradient: 'linear-gradient(90deg, #D97706, #F59E0B)',
    outputOptions: ['op_ed'],
    category: 'editorial',
  },
  {
    id: 'explainer_box',
    label: 'ET Explainer Box',
    icon: HelpCircle,
    borderGradient: 'linear-gradient(90deg, #E11D48, #FB7185)',
    outputOptions: ['explainer_box'],
    category: 'editorial',
  },
];

/* ------------------------------------------------------------------ */
/*  Tone options                                                      */
/* ------------------------------------------------------------------ */

const TONE_OPTIONS = ['authoritative', 'accessible', 'analytical'] as const;
type Tone = (typeof TONE_OPTIONS)[number];

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatTimeAgo(createdAt: string): string {
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
}

function formatDate(createdAt: string): string {
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/* ------------------------------------------------------------------ */
/*  Status badge helper                                               */
/* ------------------------------------------------------------------ */

function statusBadge(status: string) {
  switch (status) {
    case 'completed':
      return { label: 'Completed', cls: 'bg-success text-white px-3 py-1' };
    case 'running':
      return { label: 'Running', cls: 'bg-accent-primary text-white px-3 py-1 badge-processing' };
    case 'awaiting_approval':
      return { label: 'Awaiting Review', cls: 'bg-warning text-white px-3 py-1' };
    case 'failed':
      return { label: 'Failed', cls: 'bg-error text-white px-3 py-1' };
    case 'escalated':
      return { label: 'Escalated', cls: 'bg-orange-500 text-white px-3 py-1' };
    default:
      return { label: status, cls: 'bg-text-tertiary/20 text-text-secondary px-3 py-1' };
  }
}

/* ------------------------------------------------------------------ */
/*  Dashboard component                                               */
/* ------------------------------------------------------------------ */

export function Dashboard() {
  const navigate = useNavigate();

  /* --- data -------------------------------------------------------- */
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [styleMemory, setStyleMemory] = useState<StyleMemoryResponse | null>(null);

  useEffect(() => {
    Promise.all([getDashboardSummary(), getStyleMemory(20)])
      .then(([s, m]) => {
        setSummary(s);
        setStyleMemory(m);
      })
      .catch(console.error);
  }, []);

  /* --- slide-over state ------------------------------------------- */
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedOutputOptions, setSelectedOutputOptions] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [topic, setTopic] = useState('');
  const [description, setDescription] = useState('');
  const [tone, setTone] = useState<Tone>('authoritative');
  const [langHi, setLangHi] = useState(false);
  const [sessionId, setSessionId] = useState(() => generateId());
  const [running, setRunning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const openDrawer = useCallback((tile: TemplateTile) => {
    setSelectedOutputOptions(tile.outputOptions);
    setSelectedCategory(tile.category);
    setDrawerOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
  }, []);

  /* close on ESC */
  useEffect(() => {
    if (!drawerOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrawer();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [drawerOpen, closeDrawer]);

  /* --- actions ----------------------------------------------------- */
  const handleRunPipeline = async () => {
    if (!topic.trim()) return;
    setRunning(true);
    try {
      const langs: string[] = ['en'];
      if (langHi) langs.push('hi');

      const brief: Record<string, unknown> = {
        topic: topic.trim(),
        description: description.trim(),
        content_category: selectedCategory,
        tone,
        target_languages: langs,
        output_options: selectedOutputOptions,
      };

      const result = await startPipeline(
        brief as { topic: string; description: string; content_category?: string },
        sessionId,
      );

      closeDrawer();
      navigate(`/pipeline/${result.run_id}`, { state: { category: selectedCategory } });
    } catch (err) {
      console.error(err);
    } finally {
      setRunning(false);
    }
  };

  const handleUploadGuide = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadBrandGuide(file, sessionId);
    } catch (err) {
      console.error(err);
    }
  };

  const handlePipelineClick = (run: { id: string; status: string }) => {
    if (run.status === 'awaiting_approval') {
      navigate(`/approval/${run.id}`);
    } else if (run.status === 'running') {
      navigate(`/pipeline/${run.id}`);
    } else {
      navigate(`/audit/${run.id}`);
    }
  };

  /* ================================================================ */
  /*  RENDER                                                          */
  /* ================================================================ */

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="min-h-screen bg-bg-primary"
    >
      <main className="max-w-[1600px] mx-auto px-8 py-8 md:py-12">
        {/* ------ Section: Template Grid ------ */}
        <section className="mb-8">
          <h2 className="text-text-secondary text-sm font-medium mb-6">
            What would you like to create?
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-6">
            {TEMPLATE_TILES.map((tile) => {
              const Icon = tile.icon;
              return (
                <button
                  key={tile.id}
                  onClick={() => openDrawer(tile)}
                  className="card text-left p-4 pt-0 overflow-hidden transition-transform hover:scale-[1.02] hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
                >
                  {/* colored top border strip */}
                  <div
                    className="h-1 -mx-4 mb-3"
                    style={{ background: tile.borderGradient }}
                  />
                  <div className="flex items-center gap-3">
                    <Icon className="w-6 h-6 text-text-secondary shrink-0" />
                    <span className="text-text-primary font-semibold text-base">
                      {tile.label}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* ------ Activity Area: Recent Pipelines (70%) + Achievement Cards & Brand Hub (30%) ------ */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_0.45fr] gap-6">
          {/* LEFT COLUMN 70%: Recent Pipelines */}
          <section>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-text-secondary text-sm font-medium">Recent Pipelines</h2>
              <button
                onClick={() => navigate('/pipelines')}
                className="flex items-center gap-1 text-accent-primary text-sm hover:gap-2 transition-all"
              >
                View all <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {summary?.most_recent_runs && summary.most_recent_runs.length > 0 ? (
              <div className="grid grid-cols-1 gap-4">
                {summary.most_recent_runs.map((run) => {
                  const badge = statusBadge(run.status);
                  return (
                    <button
                      key={run.id}
                      onClick={() => handlePipelineClick(run)}
                      className="card text-left p-5 transition-transform hover:scale-[1.01] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
                    >
                      <p className="text-text-primary mb-3 line-clamp-2 font-medium leading-relaxed">
                        {run.brief_topic}
                      </p>
                      <div className="flex items-center justify-between">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium ${badge.cls}`}
                        >
                          {badge.label}
                        </span>
                        <span className="text-xs text-text-tertiary">
                          {formatDate(run.created_at)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="card p-8 text-center text-sm text-text-secondary">
                No pipelines yet. Pick a template above to get started.
              </div>
            )}
          </section>

          {/* RIGHT COLUMN 30%: Achievement Cards + Brand Hub */}
          <div className="space-y-6">
            {/* Achievement Cards */}
            {summary && (
              <section>
                <div className="grid grid-cols-2 gap-3">
                  <div className="card-surface p-4">
                    <Clock className="w-4 h-4 text-success mb-2" />
                    <p className="text-xs text-text-secondary mb-1">Hours Saved</p>
                    <p className="text-text-primary text-lg font-semibold">
                      {summary.total_time_saved_hours.toFixed(1)}h
                    </p>
                  </div>

                  <div className="card-surface p-4">
                    <IndianRupee className="w-4 h-4 text-accent-primary mb-2" />
                    <p className="text-xs text-text-secondary mb-1">Cost Equiv.</p>
                    <p className="text-text-primary text-lg font-semibold">
                      {(summary.total_cost_saved_inr / 1000).toFixed(0)}k
                    </p>
                  </div>

                  <div className="card-surface p-4">
                    <CheckCircle className="w-4 h-4 text-accent-primary mb-2" />
                    <p className="text-xs text-text-secondary mb-1">Runs Done</p>
                    <p className="text-text-primary text-lg font-semibold">
                      {summary.total_runs}
                    </p>
                  </div>

                  <div className="card-surface p-4">
                    <Edit3 className="w-4 h-4 text-warning mb-2" />
                    <p className="text-xs text-text-secondary mb-1">Corrections</p>
                    <p className="text-text-primary text-lg font-semibold">
                      {summary.total_corrections_captured}
                    </p>
                  </div>
                </div>
              </section>
            )}

            {/* Brand Hub */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-text-secondary text-sm font-medium">Brand Hub</h2>
                <span className="text-xs text-text-tertiary">
                  {styleMemory?.total ?? 0}
                </span>
              </div>

              {!styleMemory || styleMemory.categories.length === 0 ? (
                <div className="card-surface p-5 text-xs text-text-secondary text-center">
                  No corrections yet.
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {styleMemory.categories.slice(0, 3).map((category) => {
                    const entries = styleMemory.by_category[category] || [];
                    return (
                      <div key={category} className="card-surface p-4">
                        <p className="text-xs font-semibold text-text-primary capitalize mb-2">
                          {category}
                        </p>
                        <ul className="space-y-1 text-xs text-text-secondary">
                          {entries.slice(0, 2).map((entry, idx) => (
                            <li key={`${category}-${idx}`} className="line-clamp-1">
                              {entry}
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </div>
      </main>

      {/* Creation Slide-over */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            {/* backdrop */}
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 z-40 bg-black/50"
              onClick={closeDrawer}
            />

            {/* drawer panel */}
            <motion.aside
              key="drawer"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="fixed top-0 right-0 z-50 h-full w-full max-w-md bg-bg-surface shadow-2xl flex flex-col"
            >
              {/* header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-border-default">
                <h3 className="text-text-primary font-semibold text-lg">Create Content</h3>
                <button
                  onClick={closeDrawer}
                  className="p-1 rounded-md hover:bg-bg-elevated transition-colors text-text-secondary"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* body */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                {/* Topic */}
                <div>
                  <label className="block text-xs text-text-secondary mb-1.5">Topic</label>
                  <input
                    type="text"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="Enter topic"
                    className="w-full bg-bg-elevated border border-border-default rounded-lg px-3 py-2.5 text-text-primary placeholder:text-text-tertiary focus:border-border-emphasis focus:outline-none transition-colors"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs text-text-secondary mb-1.5">Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe what you want..."
                    rows={4}
                    className="w-full bg-bg-elevated border border-border-default rounded-lg px-3 py-2.5 text-text-primary placeholder:text-text-tertiary resize-none focus:border-border-emphasis focus:outline-none transition-colors"
                  />
                </div>

                {/* Tone */}
                <div>
                  <label className="block text-xs text-text-secondary mb-2">Tone</label>
                  <div className="flex gap-3">
                    {TONE_OPTIONS.map((t) => (
                      <label
                        key={t}
                        className={`flex items-center gap-2 cursor-pointer px-3 py-2 rounded-lg border transition-colors text-sm capitalize ${
                          tone === t
                            ? 'border-accent-primary bg-accent-primary/10 text-accent-primary'
                            : 'border-border-default text-text-secondary hover:border-text-tertiary'
                        }`}
                      >
                        <input
                          type="radio"
                          name="tone"
                          value={t}
                          checked={tone === t}
                          onChange={() => setTone(t)}
                          className="sr-only"
                        />
                        {t}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Language toggles */}
                <div>
                  <label className="block text-xs text-text-secondary mb-2">Languages</label>
                  <div className="flex gap-3">
                    <span className="px-4 py-2 rounded-lg bg-accent-primary/15 text-accent-primary text-sm font-medium">
                      EN
                    </span>
                    <button
                      type="button"
                      onClick={() => setLangHi((v) => !v)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        langHi
                          ? 'border-accent-primary bg-accent-primary/15 text-accent-primary'
                          : 'border-border-default text-text-secondary hover:border-text-tertiary'
                      }`}
                    >
                      HI
                    </button>
                  </div>
                </div>

                {/* Session ID */}
                <div>
                  <label className="block text-xs text-text-secondary mb-1.5">Session ID</label>
                  <input
                    type="text"
                    value={sessionId}
                    readOnly
                    className="w-full bg-bg-elevated border border-border-default rounded-lg px-3 py-2.5 text-text-tertiary text-xs font-mono focus:outline-none"
                  />
                </div>

                {/* Upload brand guide */}
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.docx,.txt"
                    onChange={handleUploadGuide}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border-default text-text-secondary text-sm hover:border-text-tertiary hover:text-text-primary transition-colors"
                  >
                    <Upload className="w-4 h-4" />
                    Upload brand guide
                  </button>
                </div>
              </div>

              {/* footer */}
              <div className="px-6 py-4 border-t border-border-default">
                <button
                  type="button"
                  onClick={handleRunPipeline}
                  disabled={running || !topic.trim()}
                  className="btn-cta w-full disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {running ? 'Starting...' : 'Run Pipeline'}
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
