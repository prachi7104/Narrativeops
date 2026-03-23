import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Twitter, Linkedin, MessageCircle, FileText, ChevronDown, ChevronUp } from 'lucide-react';

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
  const [brief, setBrief] = useState('');
  const [selectedChannels, setSelectedChannels] = useState<string[]>(['blog', 'twitter']);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(['english']);
  const [selectedTone, setSelectedTone] = useState('Accessible');
  const [engagementExpanded, setEngagementExpanded] = useState(false);
  const [engagementData, setEngagementData] = useState('{\n  "scenario": 3,\n  "metrics": {\n    "engagement_rate": 0.45\n  }\n}');

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

  const handleRunPipeline = () => {
    navigate('/pipeline/demo-123');
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
            className="w-full px-6 py-3 bg-accent-primary text-white rounded-md hover:bg-accent-primary/90 transition-colors font-medium"
          >
            Run NarrativeOps pipeline
          </button>
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
