import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Twitter, Linkedin, MessageCircle, FileText, ArrowRight } from 'lucide-react';

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

const RECENT_PIPELINES = [
  {
    id: 1,
    brief: 'Exploring the impact of AI on modern healthcare systems and patient outcomes',
    channels: ['blog', 'linkedin', 'twitter'],
    compliance: 'PASS',
    timestamp: '2 hours ago',
  },
  {
    id: 2,
    brief: 'Breaking down the latest developments in sustainable energy technology',
    channels: ['blog', 'twitter'],
    compliance: 'REVISE',
    timestamp: '5 hours ago',
  },
  {
    id: 3,
    brief: 'How remote work is reshaping corporate culture and productivity',
    channels: ['linkedin', 'whatsapp'],
    compliance: 'PASS',
    timestamp: '1 day ago',
  },
];

export function Dashboard() {
  const navigate = useNavigate();
  const [brief, setBrief] = useState('');
  const [selectedChannels, setSelectedChannels] = useState<string[]>(['blog']);
  const [language, setLanguage] = useState<'EN' | 'HI'>('EN');

  const toggleChannel = (channelId: string) => {
    setSelectedChannels((prev) =>
      prev.includes(channelId)
        ? prev.filter((c) => c !== channelId)
        : [...prev, channelId]
    );
  };

  const handleRunPipeline = () => {
    navigate('/configure');
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

  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Top Navigation */}
      <nav className="h-16 border-b border-border-default px-4 md:px-6 flex items-center justify-between">
        <div className="text-text-primary font-semibold">NarrativeOps</div>
        <div className="flex items-center gap-3 md:gap-4">
          <button
            onClick={() => navigate('/pipelines')}
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

        {/* Trending Topics */}
        <div className="max-w-3xl mx-auto mb-8 md:mb-12">
          <p className="text-xs text-text-secondary mb-3">Trending in your category</p>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {TRENDING_TOPICS.map((topic) => (
              <button
                key={topic}
                onClick={() => setBrief(topic)}
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
            {RECENT_PIPELINES.map((pipeline) => (
              <div
                key={pipeline.id}
                onClick={() => navigate(`/approval/${pipeline.id}`)}
                className="bg-bg-surface border border-border-default rounded-[--radius-md] p-6 hover:border-accent-primary/40 cursor-pointer transition-colors"
              >
                {/* Brief Text */}
                <p className="text-text-primary mb-4 line-clamp-2 leading-relaxed">
                  {pipeline.brief}
                </p>

                {/* Channel Icons */}
                <div className="flex gap-2 mb-4">
                  {pipeline.channels.map((channelId) => {
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

                {/* Bottom Row */}
                <div className="flex items-center justify-between">
                  <span
                    className={`px-3 py-1 rounded-full text-xs border font-medium ${getComplianceBadgeStyle(
                      pipeline.compliance
                    )}`}
                  >
                    {pipeline.compliance}
                  </span>
                  <span className="text-xs text-text-tertiary">{pipeline.timestamp}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}