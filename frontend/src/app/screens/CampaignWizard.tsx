import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useLocation, useNavigate } from 'react-router';
import { ArrowLeft, FileText, Linkedin, Loader2, MessageCircle, Newspaper, Sparkles, Twitter } from 'lucide-react';

import { startPipeline, uploadBrandGuide } from '../../api/client';

type OutputOption = 'blog' | 'faq' | 'publisher_brief' | 'twitter' | 'linkedin' | 'whatsapp';

const PUBLISH_OPTIONS: Array<{ id: OutputOption; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'blog', label: 'Blog', icon: FileText },
  { id: 'faq', label: 'FAQ', icon: FileText },
  { id: 'publisher_brief', label: 'Publisher Brief', icon: Newspaper },
  { id: 'twitter', label: 'Twitter', icon: Twitter },
  { id: 'linkedin', label: 'LinkedIn', icon: Linkedin },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
];

const TONES = ['Authoritative', 'Accessible', 'Analytical', 'Urgent'] as const;

function detectCategory(text: string): 'mutual_fund' | 'fintech' | 'general' {
  const lower = text.toLowerCase();
  if (lower.includes('mutual fund') || lower.includes('sip') || lower.includes('nav')) return 'mutual_fund';
  if (lower.includes('fintech') || lower.includes('payment') || lower.includes('insurance')) return 'fintech';
  return 'general';
}

export function CampaignWizard() {
  const navigate = useNavigate();
  const location = useLocation();
  const prefillBrief = (location.state as { prefillBrief?: string } | null)?.prefillBrief || '';

  const [step, setStep] = useState(0);
  const [brief, setBrief] = useState(prefillBrief);
  const [selectedChannels, setSelectedChannels] = useState<OutputOption[]>(['blog', 'twitter']);
  const [selectedTone, setSelectedTone] = useState<string>('Accessible');
  const [simulatePivot, setSimulatePivot] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const [sessionId] = useState(() => crypto.randomUUID());
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [rulesExtracted, setRulesExtracted] = useState<number | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const applySmartDefaults = (text: string) => {
    const category = detectCategory(text);
    if (category === 'mutual_fund') {
      setSelectedTone('Analytical');
      setSelectedChannels(['blog', 'linkedin', 'twitter']);
      return;
    }
    if (category === 'fintech') {
      setSelectedTone('Authoritative');
      setSelectedChannels(['blog', 'twitter', 'linkedin']);
      return;
    }
    setSelectedTone('Accessible');
    setSelectedChannels(['blog', 'twitter']);
  };

  const toggleChannel = (id: OutputOption) => {
    setSelectedChannels((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const processSelectedFile = async (file: File) => {
    setPdfFile(file);
    setIsUploading(true);
    try {
      const result = await uploadBrandGuide(file, sessionId);
      setRulesExtracted(result.rules_extracted);
    } finally {
      setIsUploading(false);
    }
  };

  const submit = async () => {
    setIsRunning(true);
    setRunError(null);

    try {
      const contentCategory = detectCategory(brief);
      const engagementData = simulatePivot ? { scenario: 3, metrics: { engagement_rate: 0.45 } } : null;
      const result = await startPipeline(
        {
          topic: brief.slice(0, 100),
          description: brief,
          content_category: contentCategory,
          output_options: selectedChannels,
          tone: selectedTone.toLowerCase(),
          target_languages: ['en'],
        },
        sessionId,
        engagementData,
      );

      navigate('/pipeline/' + result.run_id, { state: { category: contentCategory } });
    } catch {
      setRunError('Unable to launch campaign. Please try again.');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-primary px-4 pb-8 pt-6 md:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-start justify-between gap-4">
          <button
            onClick={() => navigate('/')}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-border-default bg-white text-text-secondary transition hover:-translate-y-0.5 hover:shadow-lg"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-2xl md:text-3xl">New Campaign Wizard</h1>
            <p className="mt-1 text-sm text-text-secondary">Lumina: Enterprise content, on autopilot.</p>
          </div>
          <div className="rounded-full bg-white px-4 py-2 text-xs text-text-secondary shadow-sm">Step {step + 1} of 3</div>
        </div>

        <div className="rounded-2xl border border-border-default bg-white/80 p-6 shadow-md backdrop-blur-md">
          <AnimatePresence mode="wait">
            {step === 0 && (
              <motion.div
                key="intent"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.24, ease: 'easeOut' }}
              >
                <h2 className="mb-2 text-xl">What are we launching?</h2>
                <p className="mb-4 text-sm text-text-secondary">Define the campaign goal in natural language. Lumina handles the orchestration.</p>
                <textarea
                  value={brief}
                  onChange={(event) => {
                    const value = event.target.value;
                    setBrief(value);
                    if (value.trim().length > 12) {
                      applySmartDefaults(value);
                    }
                  }}
                  className="min-h-[220px] w-full rounded-2xl border border-border-emphasis bg-white p-5 text-base text-text-primary outline-none transition focus:border-accent-primary"
                  placeholder="Campaign Goal: Launch our new sustainable investment plan for first-time investors..."
                />
                <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-accent-primary/10 px-3 py-1 text-xs text-accent-primary">
                  <Sparkles className="h-3.5 w-3.5" />
                  Smart defaults auto-configure tone and channels when finance signals are detected.
                </div>
              </motion.div>
            )}

            {step === 1 && (
              <motion.div
                key="output"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.24, ease: 'easeOut' }}
              >
                <h2 className="mb-2 text-xl">Where are we publishing?</h2>
                <p className="mb-4 text-sm text-text-secondary">Select one or more channels for this campaign.</p>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {PUBLISH_OPTIONS.map((item) => {
                    const Icon = item.icon;
                    const selected = selectedChannels.includes(item.id);
                    return (
                      <button
                        key={item.id}
                        onClick={() => toggleChannel(item.id)}
                        className={`flex min-h-14 items-center gap-3 rounded-2xl border p-4 text-left transition hover:-translate-y-1 hover:shadow-lg ${
                          selected ? 'border-accent-primary bg-accent-primary/10 text-accent-primary' : 'border-border-default bg-white text-text-primary'
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                        <span className="text-sm font-medium">{item.label}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-5">
                  <p className="mb-2 text-xs font-medium uppercase tracking-widest text-text-secondary">Tone</p>
                  <div className="flex flex-wrap gap-2">
                    {TONES.map((tone) => (
                      <button
                        key={tone}
                        onClick={() => setSelectedTone(tone)}
                        className={`min-h-11 rounded-full px-4 text-sm transition ${
                          tone === selectedTone ? 'bg-accent-primary text-white' : 'bg-bg-surface text-text-secondary hover:bg-bg-elevated'
                        }`}
                      >
                        {tone}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="governance"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.24, ease: 'easeOut' }}
              >
                <h2 className="mb-2 text-xl">Brand Guardrails</h2>
                <p className="mb-4 text-sm text-text-secondary">Attach brand rules and connect demo analytics controls.</p>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      void processSelectedFile(file);
                    }
                  }}
                />

                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => fileInputRef.current?.click()}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setIsDragOver(true);
                  }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    setIsDragOver(false);
                    const file = event.dataTransfer.files?.[0];
                    if (file) {
                      void processSelectedFile(file);
                    }
                  }}
                  className={`rounded-2xl border-2 border-dashed p-8 transition ${
                    isDragOver ? 'border-accent-primary bg-accent-primary/10' : 'border-border-default bg-bg-surface'
                  }`}
                >
                  <p className="text-sm text-text-primary">{pdfFile ? pdfFile.name : 'Drop a PDF brand guide here, or click to upload'}</p>
                  {isUploading && (
                    <div className="mt-2 inline-flex items-center gap-2 text-xs text-text-secondary">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Reading PDF and extracting rules...
                    </div>
                  )}
                  {!isUploading && rulesExtracted !== null && (
                    <p className="mt-2 text-xs text-success">{rulesExtracted} rules extracted and ready.</p>
                  )}
                </div>

                <div className="mt-5 rounded-2xl border border-border-default bg-white p-4">
                  <p className="mb-3 text-sm font-medium text-text-primary">Connect Analytics</p>
                  <div className="flex flex-wrap gap-2">
                    <button className="min-h-11 rounded-full border border-border-default px-4 text-sm text-text-secondary hover:border-text-secondary">HubSpot (demo)</button>
                    <button className="min-h-11 rounded-full border border-border-default px-4 text-sm text-text-secondary hover:border-text-secondary">Google Analytics (demo)</button>
                  </div>
                  <label className="mt-4 flex min-h-11 items-center justify-between rounded-xl bg-bg-primary px-3">
                    <span className="text-sm text-text-primary">Simulate Audience Pivot</span>
                    <button
                      type="button"
                      onClick={() => setSimulatePivot((prev) => !prev)}
                      className={`h-7 w-12 rounded-full transition ${simulatePivot ? 'bg-accent-primary' : 'bg-bg-elevated'}`}
                    >
                      <span className={`block h-5 w-5 rounded-full bg-white transition ${simulatePivot ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </label>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-8 flex items-center justify-between">
            <button
              onClick={() => setStep((prev) => Math.max(0, prev - 1))}
              disabled={step === 0}
              className="min-h-11 rounded-full border border-border-default px-5 text-sm text-text-secondary transition disabled:opacity-50"
            >
              Back
            </button>

            {step < 2 ? (
              <button
                onClick={() => setStep((prev) => Math.min(2, prev + 1))}
                className="min-h-11 rounded-full bg-gradient-to-r from-purple-600 to-cyan-500 px-6 text-sm font-semibold text-white shadow-cta transition hover:-translate-y-0.5"
              >
                Continue
              </button>
            ) : (
              <button
                onClick={() => void submit()}
                disabled={isRunning || !brief.trim()}
                className="min-h-11 rounded-full bg-gradient-to-r from-purple-600 to-cyan-500 px-6 text-sm font-semibold text-white shadow-cta transition hover:-translate-y-0.5 disabled:opacity-60"
              >
                {isRunning ? 'Launching...' : 'Launch campaign'}
              </button>
            )}
          </div>
          {runError && <p className="mt-3 text-sm text-error">{runError}</p>}
        </div>
      </div>
    </div>
  );
}
