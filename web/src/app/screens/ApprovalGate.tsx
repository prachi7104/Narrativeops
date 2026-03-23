import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Twitter, Linkedin, MessageCircle, FileText, Edit3, Check, X, ArrowLeft } from 'lucide-react';

type Channel = 'blog' | 'twitter' | 'linkedin' | 'whatsapp' | 'hindi';

interface ChannelContent {
  blog: string;
  twitter: string[];
  linkedin: string;
  whatsapp: string;
  hindi: string;
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

const MOCK_CONTENT: ChannelContent = {
  blog: `<h1>The Future of AI in Healthcare</h1>
<p>Artificial Intelligence is transforming the healthcare industry in unprecedented ways. From diagnostic imaging to personalized treatment plans, AI systems are augmenting the capabilities of medical professionals worldwide.</p>
<h2>Key Applications</h2>
<p>Machine learning algorithms can now detect patterns in medical imaging that human eyes might miss. This technology is particularly promising in early cancer detection and radiology.</p>
<p><strong>Disclaimer:</strong> This content is for informational purposes only and should not be considered medical advice.</p>`,
  twitter: [
    '1/ AI is revolutionizing healthcare. Here\'s what you need to know about the latest developments in medical AI 🧵',
    '2/ Machine learning algorithms are now detecting patterns in medical imaging that can help identify diseases earlier than ever before',
    '3/ From personalized treatment plans to predictive diagnostics, AI is augmenting (not replacing) healthcare professionals',
    '4/ Important: Always consult with qualified healthcare professionals. AI is a tool to assist, not replace, medical expertise',
  ],
  linkedin: `The healthcare industry stands at the precipice of an AI-driven transformation. Recent advances in machine learning are enabling earlier disease detection, personalized treatment protocols, and improved patient outcomes.

Key insights:
• AI-powered diagnostic imaging shows 95% accuracy in early cancer detection
• Predictive analytics help hospitals optimize resource allocation
• Personalized medicine powered by AI is becoming mainstream

As we embrace these innovations, it's crucial to maintain the human element in healthcare. AI augments medical professionals; it doesn't replace them.

#HealthTech #AI #Healthcare #Innovation`,
  whatsapp: `🏥 *AI in Healthcare: What You Should Know*

Artificial Intelligence is changing how we approach medical care. From early disease detection to personalized treatments, AI is making healthcare more effective.

*Key Points:*
✓ Better diagnostic accuracy
✓ Faster treatment planning
✓ Improved patient outcomes

Remember: AI assists healthcare professionals but doesn't replace them. Always consult qualified medical experts for health decisions.

Share with someone interested in healthcare innovation! 📱`,
  hindi: `स्वास्थ्य सेवा में AI का भविष्य

कृत्रिम बुद्धिमत्ता स्वास्थ्य सेवा उद्योग को अभूतपूर्व तरीकों से बदल रही है। डायग्नोस्टिक इमेजिंग से लेकर व्यक्तिगत उपचार योजनाओं तक, AI सिस्टम दुनिया भर में चिकित्सा पेशेवरों की क्षमताओं को बढ़ा रहे हैं।`,
};

export function ApprovalGate() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [activeTab, setActiveTab] = useState<Channel>('blog');
  const [editMode, setEditMode] = useState(false);
  const [editedContent, setEditedContent] = useState<ChannelContent>(MOCK_CONTENT);
  const [unsavedTabs, setUnsavedTabs] = useState<Set<Channel>>(new Set());

  const handleEdit = () => {
    setEditMode(true);
  };

  const handleSave = () => {
    setEditMode(false);
    setUnsavedTabs((prev) => {
      const newSet = new Set(prev);
      newSet.delete(activeTab);
      return newSet;
    });
  };

  const handleCancel = () => {
    setEditMode(false);
    setEditedContent(MOCK_CONTENT);
  };

  const handleContentChange = (value: string) => {
    if (activeTab === 'twitter') return;
    setEditedContent((prev) => ({
      ...prev,
      [activeTab]: value,
    }));
    setUnsavedTabs((prev) => new Set(prev).add(activeTab));
  };

  const handleApprove = () => {
    navigate('/pipelines');
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
    const content = editedContent[activeTab];

    if (editMode) {
      if (activeTab === 'twitter') {
        return (
          <div className="space-y-3">
            {(content as string[]).map((tweet, index) => (
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
              <span>Word count: {(content as string).split(' ').length}</span>
              <span>Characters: {(content as string).length}</span>
            </div>
            <button
              onClick={() => setEditedContent(MOCK_CONTENT)}
              className="text-xs text-accent-primary hover:underline"
            >
              Revert
            </button>
          </div>
          <textarea
            value={content as string}
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
          dangerouslySetInnerHTML={{ __html: content as string }}
        />
      );
    }

    if (activeTab === 'twitter') {
      return (
        <div className="space-y-3">
          {(content as string[]).map((tweet, index) => (
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
        <p className="whitespace-pre-wrap text-text-primary leading-relaxed">{content as string}</p>
        <div className="text-xs text-text-tertiary mt-4">
          {(content as string).length} characters
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
        <div className="flex-1">{renderContent()}</div>

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