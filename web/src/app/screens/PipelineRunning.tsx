import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router';
import { StopCircle } from 'lucide-react';

type AgentStatus = 'pending' | 'running' | 'done' | 'warning' | 'error';

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
  const navigate = useNavigate();
  const { id } = useParams();
  const [agents, setAgents] = useState<Agent[]>(INITIAL_AGENTS);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [elapsedTime, setElapsedTime] = useState(0);
  const logEndRef = useRef<HTMLDivElement>(null);
  const logIdCounter = useRef(1);

  // Auto-scroll logs
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Simulate pipeline execution
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedTime((prev) => prev + 1);
    }, 1000);

    // Simulate agent progression
    const agentTimer = setTimeout(() => {
      simulateAgentProgress();
    }, 1000);

    return () => {
      clearInterval(timer);
      clearTimeout(agentTimer);
    };
  }, []);

  const addLog = (agent: string, message: string, level: LogEntry['level'] = 'info') => {
    const now = new Date();
    const timestamp = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    setLogs((prev) => [...prev, {
      id: logIdCounter.current++,
      timestamp,
      agent,
      message,
      level,
    }]);
  };

  const simulateAgentProgress = () => {
    let currentIndex = 0;
    const interval = setInterval(() => {
      if (currentIndex >= INITIAL_AGENTS.length) {
        clearInterval(interval);
        // Navigate to approval page after completion
        setTimeout(() => {
          navigate(`/approval/${id}`);
        }, 2000);
        return;
      }

      const agent = INITIAL_AGENTS[currentIndex];

      // Start agent
      setAgents((prev) =>
        prev.map((a) => (a.id === agent.id ? { ...a, status: 'running' as AgentStatus } : a))
      );
      addLog(agent.name, `Starting ${agent.name.toLowerCase()} agent...`, 'info');

      // Simulate work
      setTimeout(() => {
        // Special case for Compliance - simulate retry
        if (agent.name === 'Compliance') {
          setAgents((prev) =>
            prev.map((a) =>
              a.id === agent.id ? { ...a, status: 'warning' as AgentStatus, attempt: 'Attempt 2/3' } : a
            )
          );
          addLog(agent.name, 'Compliance issue detected, retrying...', 'warning');

          setTimeout(() => {
            setAgents((prev) =>
              prev.map((a) =>
                a.id === agent.id ? { ...a, status: 'done' as AgentStatus, attempt: undefined } : a
              )
            );
            addLog(agent.name, 'Compliance check passed on retry', 'success');
            currentIndex++;
          }, 2000);
        } else {
          // Complete agent
          setAgents((prev) =>
            prev.map((a) => (a.id === agent.id ? { ...a, status: 'done' as AgentStatus } : a))
          );
          addLog(agent.name, `${agent.name} completed successfully`, 'success');
          currentIndex++;
        }
      }, 1500);
    }, 3000);
  };

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

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col">
      {/* Top Bar */}
      <div className="h-16 border-b border-border-default px-4 md:px-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-text-secondary text-xs md:text-sm">Pipeline</span>
          <span className="font-mono text-text-tertiary text-xs hidden md:inline">{id}</span>
        </div>

        <div className="font-mono text-xl md:text-2xl text-text-primary font-semibold">
          {formatTime(elapsedTime)}
        </div>

        <button
          onClick={() => navigate('/')}
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
          <div className="max-w-2xl mx-auto space-y-3">
            {agents.map((agent, index) => (
              <div key={agent.id}>
                <div
                  className={`relative bg-bg-surface border rounded-[--radius-md] p-4 h-18 flex items-center justify-between transition-all ${
                    agent.status === 'running'
                      ? 'border-accent-primary shadow-lg shadow-accent-primary/20'
                      : agent.status === 'warning'
                      ? 'border-warning shadow-lg shadow-warning/20'
                      : 'border-border-default'
                  }`}
                >
                  {/* Progress bar for running state */}
                  {agent.status === 'running' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-bg-elevated overflow-hidden rounded-b-[--radius-md]">
                      <div className="h-full w-1/4 bg-accent-primary animate-progress" />
                    </div>
                  )}

                  <div className="flex items-center gap-4">
                    {/* Status Dot */}
                    <div className={`w-2.5 h-2.5 rounded-full ${getStatusColor(agent.status)}`} />

                    {/* Agent Name */}
                    <span className="text-text-primary font-medium">{agent.name}</span>
                  </div>

                  {/* Status Label */}
                  <span
                    className={`text-sm ${
                      agent.status === 'warning'
                        ? 'text-warning'
                        : agent.status === 'running'
                        ? 'text-accent-primary'
                        : 'text-text-secondary'
                    }`}
                  >
                    {getStatusLabel(agent)}
                  </span>
                </div>

                {/* Connecting Line */}
                {index < agents.length - 1 && (
                  <div className="flex justify-center py-2">
                    <div
                      className={`w-0.5 h-6 ${
                        agents[index + 1].status !== 'pending'
                          ? 'bg-accent-primary'
                          : 'bg-border-default border-dashed'
                      }`}
                      style={
                        agents[index + 1].status === 'pending'
                          ? { borderLeft: '1px dashed', background: 'transparent' }
                          : undefined
                      }
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
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
    </div>
  );
}