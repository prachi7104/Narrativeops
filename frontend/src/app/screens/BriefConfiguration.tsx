import { useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
  ArrowLeft,
  Twitter,
  Linkedin,
  MessageCircle,
  FileText,
  ChevronDown,
  ChevronUp,
  Loader2,
  CircleCheck,
  TriangleAlert,
} from 'lucide-react';

import { startPipeline, uploadBrandGuide } from '../../api/client';

const CHANNELS = [
  { id: 'blog', label: 'Blog', icon: FileText },
  { id: 'twitter', label: 'Twitter', icon: Twitter },
  { id: 'linkedin', label: 'LinkedIn', icon: Linkedin },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
];

const TONES = ['Authoritative', 'Accessible', 'Analytical', 'Urgent'];

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
  const [selectedChannels, setSelectedChannels] = useState<string[]>(['blog', 'twitter']);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(['english']);
  const [selectedTone, setSelectedTone] = useState('Accessible');
  const [engagementExpanded, setEngagementExpanded] = useState(false);
  const [engagementData, setEngagementData] = useState('{\n  "scenario": 3,\n  "metrics": {\n    "engagement_rate": 0.45\n  }\n}');

  const detectCategory = (text: string): 'mutual_fund' | 'fintech' | 'general' => {
    const lower = text.toLowerCase();
    if (lower.includes('mutual fund') || lower.includes('sip') || lower.includes('nav')) {
      return 'mutual_fund';
    }
    if (lower.includes('fintech') || lower.includes('payment') || lower.includes('insurance')) {
      return 'fintech';
    }
    return 'general';
  };

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

  const toggleChannel = (id: string) => {
    setSelectedChannels((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const toggleLanguage = (lang: string) => {
    setSelectedLanguages((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]
    );
  };

  const handleRunPipeline = async () => {
    let parsedEngagementData: Record<string, unknown> | null = null;

    if (engagementData.trim()) {
      try {
        parsedEngagementData = JSON.parse(engagementData) as Record<string, unknown>;
      } catch {
        parsedEngagementData = null;
      }
    }

    setIsRunning(true);
    setRunError(null);

    try {
      const result = await startPipeline(
        {
          topic: brief.slice(0, 100),
          description: brief,
          content_category: detectCategory(brief),
        },
        sessionId,
        parsedEngagementData || null,
      );
      navigate('/pipeline/' + result.run_id);
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
          <div className="text-text-primary font-semibold">NarrativeOps</div>
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
              Content brief
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
              {CHANNELS.map((channel) => {
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
                      <span className={`text-sm ${isSelected ? 'text-text-primary' : 'text-text-secondary'}`}>
                        {channel.label}
                      </span>
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

          {/* Section 5 - Engagement Data (Collapsible) */}
          <div>
            <button
              onClick={() => setEngagementExpanded(!engagementExpanded)}
              className="w-full flex items-center justify-between text-text-primary mb-3 text-sm font-medium hover:text-accent-primary transition-colors"
            >
              <span>Engagement data</span>
              {engagementExpanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
            {engagementExpanded && (
              <div>
                <textarea
                  value={engagementData}
                  onChange={(e) => setEngagementData(e.target.value)}
                  className="w-full min-h-[100px] bg-bg-surface border border-border-default rounded-md p-4 text-text-primary resize-none focus:border-accent-primary focus:outline-none transition-colors font-mono text-xs"
                />
                <p className="text-xs text-text-tertiary mt-2">
                  Provide historical engagement metrics to optimize content for Scenario 3
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Sticky Bottom CTA */}
        <div className="border-t border-border-default p-6">
          <button
            onClick={handleRunPipeline}
            disabled={isRunning}
            className="w-full px-6 py-3 bg-accent-primary text-white rounded-md hover:bg-accent-primary/90 transition-colors font-medium"
          >
            {isRunning ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Running pipeline...
              </span>
            ) : (
              'Run NarrativeOps pipeline'
            )}
          </button>
          {runError && <p className="mt-3 text-sm text-amber-500">{runError}</p>}
        </div>
      </div>

      {/* Right Panel - Preview */}
      <div className="hidden md:flex flex-1 items-center justify-center p-12 bg-bg-primary">
        <div className="max-w-md">
          <h3 className="text-text-secondary mb-8">What you'll get</h3>

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
              const channel = CHANNELS.find((c) => c.id === channelId);
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
