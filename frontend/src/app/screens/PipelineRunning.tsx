import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router';
import { Brain, FileText, Languages, PenLine, ShieldCheck, StopCircle, TrendingUp, WandSparkles } from 'lucide-react';
import { motion } from 'motion/react';

import { usePipelineSSE, AGENT_ID_MAP } from '../../hooks/usePipelineSSE';
import { cancelPipeline } from '../../api/client';

type AgentStatus = 'pending' | 'running' | 'done' | 'warning' | 'error' | 'skipped';

interface Agent {
  id: string;
  name: string;
  status: AgentStatus;
  attempt?: string;
}

interface LogEntry {
  id: number;
  timestamp: string;
  agent: string;
  message: string;
  level: 'info' | 'warning' | 'error' | 'success';
}

const SWARM_NODES: Array<{
  id: string;
  label: string;
  detail: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement> & { className?: string }>;
}> = [
  { id: '1', label: 'Intake', detail: 'Intent parsing', icon: Brain },
  { id: '2', label: 'Trend', detail: 'Signal mining', icon: TrendingUp },
  { id: '3', label: 'Draft', detail: 'Primary draft', icon: PenLine },
  { id: '4', label: 'Disclaimer', detail: 'Risk framing', icon: FileText },
  { id: '5', label: 'Compliance', detail: 'Rule checks', icon: ShieldCheck },
  { id: '6', label: 'Localization', detail: 'Language tuning', icon: Languages },
  { id: '7', label: 'Format', detail: 'Channel packaging', icon: WandSparkles },
];

const INITIAL_AGENTS: Agent[] = [
  { id: '1', name: 'Intake', status: 'pending' },
  { id: '2', name: 'Trend', status: 'pending' },
  { id: '3', name: 'Draft', status: 'pending' },
  { id: '4', name: 'Disclaimer', status: 'pending' },
  { id: '5', name: 'Compliance', status: 'pending' },
  { id: '6', name: 'Localization', status: 'pending' },
  { id: '7', name: 'Format', status: 'pending' },
];

export function PipelineRunning() {
  const { id: runId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const contentCategory = (location.state as { category?: string } | null)?.category || 'general';
  const [agents, setAgents] = useState<Agent[]>(INITIAL_AGENTS);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [complianceBounced, setComplianceBounced] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const logIdCounter = useRef(1);

  // Timer — D1 fix
  useEffect(() => {
    const interval = setInterval(() => setElapsedTime((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll logs
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const onAgentUpdate = useCallback((agentName: string, eventData: Record<string, unknown>) => {
    const agentId = AGENT_ID_MAP[agentName];
    if (!agentId) return;

    if (agentName === 'compliance_agent') {
      const verdict = String(eventData.compliance_verdict || '').toUpperCase();
      if (verdict === 'REVISE' || verdict === 'REJECT') {
        setComplianceBounced(true);
      }
      if (verdict === 'PASS') {
        setComplianceBounced(false);
      }
    }

    setAgents((prev) => prev.map((agent) => {
      if (agent.id === agentId) {
        let newStatus: AgentStatus = 'running';
        const pipelineStatus = (eventData.pipeline_status as string) || '';
        const normalized = pipelineStatus.toLowerCase();
        if (agentName === 'compliance_agent') {
          const verdict = String(eventData.compliance_verdict || '').toUpperCase();
          if (verdict === 'PASS') {
            newStatus = 'done';
          } else if (verdict === 'REVISE') {
            newStatus = 'warning';
          } else if (verdict === 'REJECT') {
            newStatus = 'error';
          } else if (normalized.includes('complete') || normalized.includes('pass')) {
            newStatus = 'done';
          }
        } else if (normalized.includes('complete') || normalized.includes('pass')) {
          newStatus = 'done';
        } else if (normalized.includes('revise')) {
          newStatus = 'warning';
        } else if (normalized.includes('escalat') || normalized.includes('fail')) {
          newStatus = 'error';
        }

        const iter = (eventData.compliance_iterations as number) || 0;
        return {
          ...agent,
          status: newStatus,
          ...(agentName === 'compliance_agent' && newStatus === 'warning'
            ? { attempt: `Attempt ${iter}/3` }
            : { attempt: undefined }),
        };
      }

      if (Number(agent.id) < Number(agentId) && agent.status === 'running') {
        return { ...agent, status: 'done' };
      }

      return agent;
    }));

    let logMessage = (eventData.pipeline_status as string) || 'processing';
    let logLevel: LogEntry['level'] = 'info';

    if (agentName === 'compliance_agent') {
      const verdict = String(eventData.compliance_verdict || '').toUpperCase();
      const iter = (eventData.compliance_iterations as number) || 0;
      const feedback = Array.isArray(eventData.compliance_feedback)
        ? (eventData.compliance_feedback as unknown[])
        : [];

      if (verdict === 'REVISE') {
        logMessage = `REVISE — ${feedback.length} violation(s) found (attempt ${iter}/3). Sending back to draft agent.`;
        logLevel = 'warning';
      } else if (verdict === 'PASS') {
        logMessage = `PASS — All compliance rules satisfied (attempt ${iter})`;
      } else if (verdict === 'REJECT') {
        logMessage = 'REJECT — Unfixable violation detected. Escalating for manual review.';
        logLevel = 'error';
      }
    }

    setLogs((prev) => [...prev, {
      id: logIdCounter.current++,
      timestamp: new Date().toISOString(),
      agent: agentName,
      message: logMessage,
      level: logLevel,
    }]);
  }, []);

  const onHumanRequired = useCallback((id: string) => {
    navigate('/approval/' + id, { state: { category: contentCategory } });
  }, [navigate, contentCategory]);

  const onError = useCallback((message: string) => {
    setPipelineError(message);
    const isEscalation = message.toLowerCase().includes('escalated for manual review');
    setAgents((prev) => prev.map((a) =>
      isEscalation
        ? (Number(a.id) >= 6 && (a.status === 'pending' || a.status === 'running')
            ? { ...a, status: 'skipped' }
            : a)
        : (a.status === 'pending' || a.status === 'running'
            ? { ...a, status: 'error' }
            : a)
    ));
    setLogs((prev) => [...prev, {
      id: logIdCounter.current++,
      timestamp: new Date().toISOString(),
      agent: 'system',
      message: 'Pipeline error: ' + message,
      level: isEscalation ? 'warning' : 'error',
    }]);
  }, []);

  const onComplete = useCallback((id: string) => {
    navigate(`/audit/${id}`);
  }, [navigate]);

  usePipelineSSE(runId || null, onAgentUpdate, onHumanRequired, onError, onComplete);

  const handleStop = useCallback(async () => {
    if (runId) {
      try {
        await cancelPipeline(runId);
      } catch {
        // Best-effort cancellation; still navigate away.
      }
    }
    navigate('/');
  }, [runId, navigate]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const getStatusColor = (status: AgentStatus) => {
    switch (status) {
      case 'pending':
        return 'bg-text-tertiary';
      case 'running':
        return 'bg-accent-primary animate-pulse-glow';
      case 'done':
        return 'bg-success';
      case 'warning':
        return 'bg-warning';
      case 'error':
        return 'bg-error';
      case 'skipped':
        return 'bg-text-tertiary/60';
      default:
        return 'bg-text-tertiary';
    }
  };

  const getStatusLabel = (agent: Agent) => {
    if (agent.attempt) return agent.attempt;
    switch (agent.status) {
      case 'pending':
        return 'Pending';
      case 'running':
        return 'Running...';
      case 'done':
        return 'Done';
      case 'warning':
        return 'Warning';
      case 'error':
        return 'Failed';
      case 'skipped':
        return 'Skipped';
      default:
        return 'Pending';
    }
  };

  const getLogColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'info':
        return 'text-text-primary';
      case 'warning':
        return 'text-warning';
      case 'error':
        return 'text-error';
      case 'success':
        return 'text-success';
      default:
        return 'text-text-primary';
    }
  };

  const strategyStatus: 'idle' | 'active' | 'done' | 'error' = agents.some((agent) => agent.id === '1' && agent.status === 'running') || agents.some((agent) => agent.id === '2' && agent.status === 'running')
    ? 'active'
    : agents.some((agent) => (agent.id === '1' || agent.id === '2') && agent.status === 'error')
      ? 'error'
      : agents.every((agent) => (agent.id === '1' || agent.id === '2') ? agent.status === 'done' : true)
        ? 'done'
        : 'idle';

  const copywriterStatus: 'idle' | 'active' | 'done' | 'error' = agents.some((agent) => ['3', '4', '6', '7'].includes(agent.id) && agent.status === 'running')
    ? 'active'
    : agents.some((agent) => ['3', '4', '6', '7'].includes(agent.id) && agent.status === 'error')
      ? 'error'
      : agents.some((agent) => ['3', '4', '6', '7'].includes(agent.id) && agent.status === 'done')
        ? 'done'
        : 'idle';

  const complianceStatus: 'idle' | 'active' | 'done' | 'error' = agents.find((agent) => agent.id === '5')?.status === 'running'
    ? 'active'
    : agents.find((agent) => agent.id === '5')?.status === 'done'
      ? 'done'
      : ['warning', 'error'].includes(agents.find((agent) => agent.id === '5')?.status || '')
        ? 'error'
        : 'idle';

  const runningIndex = agents.findIndex((agent) => agent.status === 'running');
  const furthestCompletedIndex = agents.reduce((max, agent, idx) => (
    ['done', 'warning', 'error', 'skipped'].includes(agent.status) ? Math.max(max, idx) : max
  ), -1);
  const packetTargetIndex = complianceBounced ? 2 : (runningIndex >= 0 ? runningIndex : Math.max(0, furthestCompletedIndex));
  const packetProgress = SWARM_NODES.length > 1
    ? (packetTargetIndex / (SWARM_NODES.length - 1)) * 100
    : 0;
  const complianceAgent = agents.find((agent) => agent.id === '5');

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="min-h-screen bg-bg-primary flex flex-col"
    >
      {/* Top Bar */}
      <div className="h-16 border-b border-border-default px-4 md:px-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-text-secondary text-xs md:text-sm">Pipeline</span>
          <span className="font-mono text-text-tertiary text-xs hidden md:inline">{runId}</span>
          <span className="hidden lg:inline text-[11px] text-text-secondary">Lumina: Enterprise content, on autopilot.</span>
        </div>

        <div className="font-mono text-xl md:text-2xl text-text-primary font-semibold">
          {formatTime(elapsedTime)}
        </div>

        <button
          onClick={handleStop}
          className="flex items-center gap-2 px-3 md:px-4 py-2 text-text-secondary hover:text-error transition-colors"
        >
          <StopCircle className="w-4 h-4" />
          <span className="text-xs md:text-sm hidden md:inline">Stop pipeline</span>
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col md:flex-row">
        {/* Left Column - Agent Visualization */}
        <div className="flex-1 md:w-3/5 p-4 md:p-6 lg:p-8 overflow-y-auto">
          <div className="max-w-4xl mx-auto space-y-5">
            <div className="rounded-2xl border border-border-default bg-white p-4 md:p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-text-primary">Agent Swarm</h3>
                <span className="text-xs text-text-secondary">Autonomous execution map</span>
              </div>

              <div className="overflow-x-auto pb-2">
                <div className="flex min-w-[880px] items-center gap-3">
                  {SWARM_NODES.map((node, index) => {
                    const runtime = agents.find((agent) => agent.id === node.id);
                    const status = runtime?.status || 'pending';
                    const Icon = node.icon;

                    const nodeStyle = status === 'running'
                      ? 'border-accent-primary bg-accent-primary/10 shadow-lg shadow-accent-primary/20'
                      : status === 'done'
                        ? 'border-success bg-success/10'
                        : status === 'warning'
                          ? 'border-warning bg-warning/10'
                          : status === 'error'
                            ? 'border-error bg-error/10'
                            : status === 'skipped'
                              ? 'border-border-default bg-bg-surface/70 opacity-75'
                              : 'border-border-default bg-bg-surface';

                    return (
                      <div key={node.id} className="flex items-center gap-3">
                        <div className={`w-28 shrink-0 rounded-xl border p-3 transition-colors ${nodeStyle}`}>
                          <div className="mb-2 flex items-center justify-between">
                            <Icon className="h-4 w-4 text-text-primary" />
                            <span className={`h-2.5 w-2.5 rounded-full ${getStatusColor(status)}`} />
                          </div>
                          <p className="text-xs font-medium text-text-primary">{node.label}</p>
                          <p className="mt-1 text-[11px] text-text-secondary">{node.detail}</p>
                          <p className="mt-1 text-[10px] text-text-tertiary">{runtime ? getStatusLabel(runtime) : 'Pending'}</p>
                        </div>

                        {index < SWARM_NODES.length - 1 && (
                          <div className="relative h-1 w-8 overflow-hidden rounded-full bg-border-default/70">
                            <div
                              className={`h-full rounded-full transition-colors ${index < packetTargetIndex ? 'bg-accent-primary' : 'bg-border-default/70'}`}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="relative mt-5 h-12 overflow-hidden rounded-xl border border-border-default bg-bg-primary">
                <div className="absolute left-4 right-4 top-1/2 h-1 -translate-y-1/2 rounded-full bg-border-default/60" />
                <motion.div
                  animate={{ left: `calc(${packetProgress}% + 1rem)` }}
                  transition={{ type: 'spring', stiffness: 160, damping: 22 }}
                  className={`absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-lg ${complianceBounced ? 'bg-warning shadow-warning/50' : 'bg-accent-primary shadow-accent-primary/50'}`}
                />

                {complianceBounced && complianceAgent?.status === 'warning' && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute right-3 top-2 rounded-full border border-warning/40 bg-warning/10 px-3 py-1 text-[11px] font-medium text-warning"
                  >
                    Fixing compliance error...
                  </motion.div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-border-default bg-white p-4 text-sm text-text-secondary">
              <p>
                {strategyStatus === 'active' && 'Strategy agent shaping campaign goal...'}
                {copywriterStatus === 'active' && 'Copywriter agent drafting publish-ready content...'}
                {complianceStatus === 'active' && 'Compliance guardrail reviewing tone and claims...'}
                {complianceBounced && ' Compliance requested revisions. Draft is being updated now.'}
                {strategyStatus === 'done' && copywriterStatus === 'done' && complianceStatus === 'done' && 'All agents aligned. Final output is ready.'}
              </p>
            </div>

          </div>

          {pipelineError && (
            <div className="max-w-2xl mx-auto mt-6 p-4 bg-red-900/20 border border-red-700 rounded-md">
              <p className="text-red-400 text-sm mb-3">{pipelineError}</p>
              <button
                onClick={() => navigate('/configure')}
                className="px-4 py-2 bg-accent-primary text-white rounded-md text-sm"
              >
                Try again
              </button>
            </div>
          )}
        </div>

        {/* Right Column - Live Log */}
        <div className="md:w-2/5 border-l border-border-default bg-bg-surface flex flex-col max-h-[400px] md:max-h-full">
          <div className="p-4 border-b border-border-default">
            <h3 className="text-text-primary text-sm font-medium">Live Log</h3>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2 font-mono text-xs">
            {logs.map((log) => (
              <div key={log.id} className="flex gap-3">
                <span className="text-text-tertiary whitespace-nowrap">{log.timestamp}</span>
                <span className="px-2 py-0.5 bg-bg-elevated text-text-secondary rounded text-[10px] uppercase">
                  {log.agent}
                </span>
                <span className={getLogColor(log.level)}>{log.message}</span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      </div>
    </motion.div>
  );
}