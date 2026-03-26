import { useRef, useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
  ArrowLeft,
  Twitter,
  Linkedin,
  MessageCircle,
  FileText,
  Newspaper,
  Loader2,
  CircleCheck,
  TriangleAlert,
  CheckCircle2,
} from 'lucide-react';

import { startPipeline, uploadBrandGuide } from '../../api/client';

const TONES = ['Authoritative', 'Accessible', 'Analytical', 'Urgent'];

const PUBLISH_OPTIONS = [
  {
    id: 'blog',
    label: 'Blog',
    icon: FileText,
    description: 'Long-form blog output view.',
  },
  {
    id: 'faq',
    label: 'FAQ',
    icon: FileText,
    description: 'Customer-facing Q&A set for support and distribution.',
  },
  {
    id: 'publisher_brief',
    label: 'Publisher Brief',
    icon: Newspaper,
    description: 'Editorial launch notes with SEO and distribution guidance.',
  },
  {
    id: 'twitter',
    label: 'Twitter',
    icon: Twitter,
    description: 'Thread-ready X/Twitter output.',
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    icon: Linkedin,
    description: 'Professional social post output.',
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    icon: MessageCircle,
    description: 'Compact WhatsApp summary output.',
  },
  {
    id: 'et_op_ed',
    label: 'ET Op-Ed',
    icon: FileText,
    description: 'Sharp thesis, evidence-led argument, 700-900 words.',
  },
  {
    id: 'et_explainer_box',
    label: 'ET Explainer Box (Q&A)',
    icon: FileText,
    description: 'Question-answer structure with concise data pointers.',
  },
] as const;

type OutputOption = (typeof PUBLISH_OPTIONS)[number]['id'];

const AGENT_STEPS = [
  'Intake Analysis',
  'Trend Research',
  'Content Drafting',
  'Compliance Check',
  'Localization',
];

export function BriefConfiguration() {
  const navigate = useNavigate();
  const location = useLocation();
  const prefillBrief = (location.state as { prefillBrief?: string } | null)?.prefillBrief || '';
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [brief, setBrief] = useState(prefillBrief);
  const [sessionId] = useState(() => crypto.randomUUID());
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [rulesExtracted, setRulesExtracted] = useState<number | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [selectedChannels, setSelectedChannels] = useState<OutputOption[]>(['blog', 'twitter']);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(['english']);
  const [selectedTone, setSelectedTone] = useState('Accessible');
  const [simulateDataPivot, setSimulateDataPivot] = useState(false);

  const detectContentDomain = (text: string): 'mutual_fund' | 'fintech' | 'general' => {
    const lower = text.toLowerCase();
    if (lower.includes('mutual fund') || lower.includes('sip') || lower.includes('nav')) {
      return 'mutual_fund';
    }
    if (lower.includes('fintech') || lower.includes('payment') || lower.includes('insurance')) {
      return 'fintech';
    }
    return 'general';
  };

  // Smart defaults: auto-select tone and channels based on detected category
  useEffect(() => {
    if (!brief.trim()) return;
    
    const category = detectContentDomain(brief);
    let suggestedTone = 'Accessible';
    let suggestedChannels: OutputOption[] = ['blog', 'twitter'];

    if (category === 'mutual_fund') {
      suggestedTone = 'Analytical';
      suggestedChannels = ['blog', 'linkedin', 'twitter'];
    } else if (category === 'fintech') {
      suggestedTone = 'Authoritative';
      suggestedChannels = ['blog', 'twitter', 'linkedin'];
    }

    // Auto-apply suggestions only if user hasn't explicitly changed them
    setSelectedTone(suggestedTone);
    setSelectedChannels(suggestedChannels);
  }, [brief]);

  const processSelectedFile = async (file: File) => {
    setPdfFile(file);
    setIsUploading(true);
    setPdfError(null);
    setRulesExtracted(null);

    try {
      const result = await uploadBrandGuide(file, sessionId);
      setRulesExtracted(result.rules_extracted);
      if (result.error) {
        setPdfError('Failed to process PDF. You can still run without it.');
      }
    } catch {
      setPdfError('Failed to process PDF. You can still run without it.');
    } finally {
      setIsUploading(false);
    }
  };

  const toggleChannel = (id: OutputOption) => {
    setSelectedChannels((prev) =>
      prev.includes(id)
        ? (prev.length === 1 ? prev : prev.filter((c) => c !== id))
        : [...prev, id]
    );
  };

  const toggleLanguage = (lang: string) => {
    setSelectedLanguages((prev) => {
      const next = prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang];
      if (lang === 'hindi' && !prev.includes('hindi')) {
        setSelectedChannels((channels) =>
          channels.includes('whatsapp') ? channels : [...channels, 'whatsapp']
        );
      }
      return next;
    });
  };

  const handleRunPipeline = async () => {
    const parsedEngagementData: Record<string, unknown> | null = simulateDataPivot
      ? {
          scenario: 'video_to_text_pivot',
          route: 'video_to_text',
          shift_summary: 'Video engagement dropped; prioritize concise text variants for distribution.',
          metrics: {
            source_channel: 'video',
            target_channel: 'text',
            engagement_delta_pct: -28,
            watch_time_delta_pct: -19,
          },
        }
      : null;

    setIsRunning(true);
    setRunError(null);

    try {
      const contentDomain = detectContentDomain(brief);
      const targetLanguages: string[] = ['en'];
      if (selectedLanguages.includes('hindi')) targetLanguages.push('hi');

      const result = await startPipeline(
        {
          topic: brief.slice(0, 100),
          description: brief,
          content_domain: contentDomain,
          content_category: contentDomain,
          output_options: selectedChannels,
          tone: selectedTone.toLowerCase(),
          target_languages: targetLanguages,
        },
        sessionId,
        parsedEngagementData || null,
      );
      navigate('/pipeline/' + result.run_id, { state: { category: contentDomain } });
    } catch {
      setRunError('Failed to start pipeline. Please try again.');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-primary flex">
      {/* Left Panel - Configuration */}
      <div className="w-full md:w-[480px] border-r border-border-default flex flex-col">
        {/* Header */}
        <div className="h-16 border-b border-border-default px-6 flex items-center gap-4">
          <button
            onClick={() => navigate('/')}
            className="text-text-secondary hover:text-text-primary transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="text-text-primary font-semibold">Lumina</div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Section 0 - Optional Brand Guide Upload */}
          <div>
            <label className="block text-text-primary mb-2 text-sm font-medium">
              Brand / compliance guide (optional)
            </label>
            <p className="text-xs text-text-tertiary mb-3">
              Upload your PDF brand guide. We'll extract compliance rules from it.
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                if (file) {
                  void processSelectedFile(file);
                }
              }}
            />

            <div
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0] ?? null;
                if (file) {
                  void processSelectedFile(file);
                }
              }}
              className="w-full border border-dashed border-border-default rounded-md p-4 bg-bg-surface hover:border-text-secondary transition-colors cursor-pointer"
            >
              <div className="text-sm text-text-secondary">
                {pdfFile ? pdfFile.name : 'Click or drag a PDF file here'}
              </div>
            </div>

            {isUploading && (
              <div className="mt-3 flex items-center gap-2 text-sm text-text-secondary">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Extracting rules...</span>
              </div>
            )}

            {!isUploading && rulesExtracted !== null && !pdfError && (
              <div className="mt-3 flex items-center gap-2 text-sm text-green-500">
                <CircleCheck className="w-4 h-4" />
                <span>{rulesExtracted} compliance rules extracted from your guide</span>
              </div>
            )}

            {pdfError && (
              <div className="mt-3 flex items-center gap-2 text-sm text-amber-500">
                <TriangleAlert className="w-4 h-4" />
                <span>{pdfError}</span>
              </div>
            )}
          </div>

          {/* Section 1 - Brief */}
          <div>
            <label className="block text-text-primary mb-2 text-sm font-medium">
              Campaign Intent
            </label>
            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="Describe your content requirements..."
              className="w-full min-h-[120px] bg-bg-surface border border-border-emphasis rounded-md p-4 text-text-primary placeholder:text-text-tertiary resize-none focus:border-accent-primary focus:outline-none transition-colors"
            />
          </div>

          {/* Section 2 - Channels */}
          <div>
            <label className="block text-text-primary mb-3 text-sm font-medium">
              Publish to
            </label>
            <div className="grid grid-cols-2 gap-3">
              {PUBLISH_OPTIONS.map((channel) => {
                const Icon = channel.icon;
                const isSelected = selectedChannels.includes(channel.id);
                return (
                  <button
                    key={channel.id}
                    onClick={() => toggleChannel(channel.id)}
                    className={`flex items-center justify-between p-4 rounded-md border transition-all ${
                      isSelected
                        ? 'bg-accent-primary/10 border-accent-primary'
                        : 'bg-bg-surface border-border-default hover:border-text-secondary'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={`w-6 h-6 ${isSelected ? 'text-accent-primary' : 'text-text-secondary'}`} />
                      <div className="text-left">
                        <div className={`text-sm ${isSelected ? 'text-text-primary' : 'text-text-secondary'}`}>
                          {channel.label}
                        </div>
                        <div className="text-[11px] text-text-tertiary hidden md:block">
                          {channel.description}
                        </div>
                      </div>
                    </div>
                    <div
                      className={`w-10 h-6 rounded-full transition-colors ${
                        isSelected ? 'bg-accent-primary' : 'bg-bg-elevated'
                      }`}
                    >
                      <div
                        className={`w-5 h-5 bg-white rounded-full transition-transform mt-0.5 ${
                          isSelected ? 'translate-x-4 ml-0.5' : 'ml-0.5'
                        }`}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-text-tertiary">
              Select one or more outputs. This controls generated output tabs.
            </p>
          </div>

          {/* Section 3 - Languages */}
          <div>
            <label className="block text-text-primary mb-3 text-sm font-medium">
              Languages
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => toggleLanguage('english')}
                className={`px-4 py-2 rounded-full text-sm transition-colors ${
                  selectedLanguages.includes('english')
                    ? 'bg-accent-primary text-white'
                    : 'bg-bg-surface text-text-secondary border border-border-default hover:border-text-secondary'
                }`}
              >
                English
              </button>
              <button
                onClick={() => toggleLanguage('hindi')}
                className={`px-4 py-2 rounded-full text-sm transition-colors ${
                  selectedLanguages.includes('hindi')
                    ? 'bg-accent-primary text-white'
                    : 'bg-bg-surface text-text-secondary border border-border-default hover:border-text-secondary'
                }`}
              >
                Hindi
              </button>
            </div>
          </div>

          {/* Section 4 - Tone */}
          <div>
            <label className="block text-text-primary mb-3 text-sm font-medium">
              Tone
            </label>
            <div className="flex bg-bg-surface rounded-md p-1">
              {TONES.map((tone, index) => (
                <button
                  key={tone}
                  onClick={() => setSelectedTone(tone)}
                  className={`flex-1 px-3 py-2 rounded text-xs transition-colors ${
                    selectedTone === tone
                      ? 'bg-accent-primary text-white'
                      : 'text-text-secondary hover:text-text-primary'
                  } ${index === 0 ? '' : ''}`}
                >
                  {tone}
                </button>
              ))}
            </div>
          </div>

          {/* Section 5 - Simulated pivot data */}
          <div>
            <div className="flex items-center justify-between rounded-xl border border-border-default bg-bg-surface px-4 py-3">
              <div>
                <p className="text-sm font-medium text-text-primary">Simulate Data Pivot Scenario: Video &gt; Text</p>
                <p className="mt-1 text-xs text-text-tertiary">Injects a synthetic performance pivot payload when launching the pipeline.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={simulateDataPivot}
                onClick={() => setSimulateDataPivot((prev) => !prev)}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${simulateDataPivot ? 'bg-accent-primary' : 'bg-bg-elevated'}`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${simulateDataPivot ? 'translate-x-6' : 'translate-x-1'}`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Sticky Bottom CTA */}
        <div className="border-t border-border-default p-6 space-y-4">
          {/* Pipeline Breadcrumbs */}
          <div className="mb-4">
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-widest mb-3">
              Your pipeline
            </h3>
            <div className="flex items-center justify-between gap-2 text-xs">
              {[
                { label: 'Intake', ready: !!brief.trim() },
                { label: 'Trend', ready: !!brief.trim() },
                { label: 'Compliance', ready: rulesExtracted !== null || !pdfFile },
                { label: 'Format', ready: selectedChannels.length > 0 },
                { label: 'Finalize', ready: !!selectedTone },
              ].map((step, index) => (
                <div key={step.label} className="flex items-center gap-1 flex-1">
                  <div
                    className={`flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-medium ${
                      step.ready
                        ? 'bg-success text-white'
                        : 'bg-bg-surface border border-border-default text-text-secondary'
                    }`}
                  >
                    {step.ready ? <CheckCircle2 className="w-3 h-3" /> : index + 1}
                  </div>
                  {index < 4 && (
                    <div
                      className={`flex-1 h-0.5 mx-0.5 ${
                        step.ready ? 'bg-success' : 'bg-border-default'
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {runError && (
            <div className="rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-error">
              <p className="font-medium">Unable to start pipeline</p>
              <p className="mt-1 text-xs text-text-secondary">{runError}</p>
            </div>
          )}

          <button
            onClick={handleRunPipeline}
            disabled={isRunning}
            className="w-full px-6 py-3 bg-gradient-to-r from-accent-primary to-accent-secondary text-white rounded-md hover:shadow-lg transition-all font-medium disabled:opacity-60"
          >
            {isRunning ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Running pipeline...
              </span>
            ) : (
              'Launch campaign'
            )}
          </button>
        </div>
      </div>

      {/* Right Panel - Preview */}
      <div className="hidden md:flex flex-1 items-center justify-center p-12 bg-bg-primary">
        <div className="max-w-md">
          <h3 className="text-text-secondary mb-8">Campaign output</h3>

          {/* Agent Steps */}
          <div className="mb-12 space-y-3">
            {AGENT_STEPS.map((step, index) => (
              <div key={step} className="flex items-center gap-4">
                <div className="flex flex-col items-center">
                  <div className="w-3 h-3 rounded-full bg-accent-primary/30" />
                  {index < AGENT_STEPS.length - 1 && (
                    <div className="w-0.5 h-8 bg-border-default mt-1" />
                  )}
                </div>
                <div className="text-text-secondary text-sm">{step}</div>
              </div>
            ))}
          </div>

          {/* Channel Output Placeholders */}
          <div className="space-y-3">
            {selectedChannels.map((channelId) => {
              const channel = PUBLISH_OPTIONS.find((c) => c.id === channelId);
              if (!channel) return null;
              const Icon = channel.icon;
              return (
                <div
                  key={channelId}
                  className="border border-dashed border-border-default rounded-md p-4 flex items-center gap-3"
                >
                  <Icon className="w-5 h-5 text-text-tertiary" />
                  <span className="text-text-tertiary text-sm">{channel.label} content</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
