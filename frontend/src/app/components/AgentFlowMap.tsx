import { Brain, PenLine, ShieldCheck } from 'lucide-react';
import { motion } from 'motion/react';

type NodeState = 'idle' | 'active' | 'done' | 'error';

interface AgentFlowMapProps {
  strategy: NodeState;
  copywriter: NodeState;
  compliance: NodeState;
  complianceBounced?: boolean;
}

const NODE_STYLES: Record<NodeState, string> = {
  idle: 'border-border-default bg-white text-text-secondary',
  active: 'border-accent-primary bg-accent-primary/10 text-accent-primary shadow-lg shadow-accent-primary/20',
  done: 'border-success bg-success/10 text-success',
  error: 'border-error bg-error/10 text-error',
};

export function AgentFlowMap({ strategy, copywriter, compliance, complianceBounced = false }: AgentFlowMapProps) {
  const packetPath = complianceBounced ? 'M 252 64 C 188 32, 124 32, 60 64' : 'M 60 64 C 124 32, 188 32, 252 64';

  return (
    <div className="rounded-2xl border border-border-default bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">Agent Swarm</h3>
        <span className="text-xs text-text-secondary">Live coordination map</span>
      </div>

      <div className="relative h-48 w-full overflow-hidden rounded-xl bg-bg-primary">
        <svg viewBox="0 0 312 140" className="absolute inset-0 h-full w-full">
          <path d="M 60 64 C 124 32, 188 32, 252 64" stroke="rgba(124,58,237,0.35)" strokeWidth="2" fill="none" />
          <path d="M 252 64 C 188 96, 124 96, 60 64" stroke="rgba(6,182,212,0.2)" strokeWidth="2" fill="none" />

          <motion.circle
            r="6"
            fill={complianceBounced ? '#F59E0B' : '#7C3AED'}
            animate={{ offsetDistance: ['0%', '100%'] }}
            transition={{ duration: 1.9, repeat: Infinity, ease: 'linear' }}
            style={{ offsetPath: `path('${packetPath}')` }}
          />
        </svg>

        <div className="absolute left-4 top-12 flex w-24 flex-col items-center gap-2">
          <div className={`flex h-14 w-14 items-center justify-center rounded-2xl border ${NODE_STYLES[strategy]}`}>
            <Brain className="h-6 w-6" />
          </div>
          <p className="text-center text-xs text-text-secondary">Strategy Agent</p>
        </div>

        <div className="absolute left-1/2 top-4 flex w-24 -translate-x-1/2 flex-col items-center gap-2">
          <div className={`flex h-14 w-14 items-center justify-center rounded-2xl border ${NODE_STYLES[copywriter]}`}>
            <PenLine className="h-6 w-6" />
          </div>
          <p className="text-center text-xs text-text-secondary">Copywriter Agent</p>
        </div>

        <motion.div
          animate={compliance === 'error' ? { x: [0, -4, 4, -3, 3, 0] } : { x: 0 }}
          transition={{ duration: 0.4 }}
          className="absolute right-4 top-12 flex w-24 flex-col items-center gap-2"
        >
          <div className={`flex h-14 w-14 items-center justify-center rounded-2xl border ${NODE_STYLES[compliance]}`}>
            <ShieldCheck className="h-6 w-6" />
          </div>
          <p className="text-center text-xs text-text-secondary">Compliance Guardrail</p>
        </motion.div>
      </div>
    </div>
  );
}
