interface LuminaLogoProps {
  compact?: boolean;
  showTagline?: boolean;
  className?: string;
}

export function LuminaLogo({ compact = false, showTagline = false, className = '' }: LuminaLogoProps) {
  return (
    <div className={`flex items-center gap-3 ${className}`.trim()}>
      <svg
        viewBox="0 0 64 64"
        aria-hidden="true"
        className={compact ? 'h-8 w-8' : 'h-10 w-10'}
      >
        <defs>
          <linearGradient id="lumina-purple" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#8B5CF6" />
            <stop offset="100%" stopColor="#7C3AED" />
          </linearGradient>
          <linearGradient id="lumina-cyan" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#22D3EE" />
            <stop offset="100%" stopColor="#06B6D4" />
          </linearGradient>
          <linearGradient id="lumina-emerald" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#34D399" />
            <stop offset="100%" stopColor="#10B981" />
          </linearGradient>
          <filter id="lumina-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="glow" />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <path d="M13 50 L13 14 L27 14 L27 50 Z" fill="url(#lumina-purple)" opacity="0.7" filter="url(#lumina-glow)" />
        <path d="M18 50 L46 50 L46 36 L18 36 Z" fill="url(#lumina-cyan)" opacity="0.75" filter="url(#lumina-glow)" />
        <path d="M37 14 L51 14 L51 50 L37 50 Z" fill="url(#lumina-emerald)" opacity="0.65" filter="url(#lumina-glow)" />
      </svg>

      <div>
        <p className={`${compact ? 'text-base' : 'text-lg'} font-semibold leading-none text-text-primary`}>Lumina</p>
        {showTagline && <p className="mt-1 text-[11px] leading-none text-text-secondary">Enterprise content, on autopilot.</p>}
      </div>
    </div>
  );
}
