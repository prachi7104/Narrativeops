import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Brain } from 'lucide-react';
import { getStyleMemory } from '../api/client';
import type { StyleMemoryResponse } from '../api/types';

export function BrandHub() {
  const [styleMemory, setStyleMemory] = useState<StyleMemoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getStyleMemory(50)
      .then((data) => {
        setStyleMemory(data);
      })
      .catch((err) => {
        console.error(err);
        setError('Failed to load brand intelligence. Please try again.');
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="min-h-screen bg-bg-primary"
    >
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-accent-primary/10 flex items-center justify-center">
            <Brain className="w-5 h-5 text-accent-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">Brand Hub</h1>
            <p className="text-sm text-text-secondary mt-0.5">
              Editorial corrections captured from approvals
            </p>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="card-surface p-5 space-y-3">
                <div className="skeleton h-4 w-1/2" />
                <div className="skeleton h-3 w-full" />
                <div className="skeleton h-3 w-4/5" />
                <div className="skeleton h-3 w-3/5" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="rounded-xl border border-error/30 bg-error/10 px-5 py-4 text-sm text-error">
            {error}
          </div>
        ) : !styleMemory || styleMemory.categories.length === 0 ? (
          <div className="card p-12 text-center">
            <Brain className="w-12 h-12 text-text-tertiary mx-auto mb-4" />
            <p className="text-text-primary font-medium mb-1">No corrections captured yet</p>
            <p className="text-text-secondary text-sm">
              Approve pipelines with edits to build your brand's editorial intelligence.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-6 flex items-center gap-2">
              <span className="text-sm text-text-secondary">
                {styleMemory.total} total corrections across {styleMemory.categories.length} categories
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {styleMemory.categories.map((category) => {
                const entries = styleMemory.by_category[category] || [];
                const confidence = Math.min(100, Math.round((entries.length / 10) * 100));
                return (
                  <div key={category} className="card p-5">
                    <div className="flex items-start justify-between mb-4">
                      <p className="text-base font-semibold text-text-primary capitalize">{category}</p>
                      <span className="px-2.5 py-1 rounded-full bg-accent-primary/10 text-accent-primary text-xs font-semibold shrink-0">
                        {confidence}% confident
                      </span>
                    </div>

                    {/* Progress bar */}
                    <div className="mb-4">
                      <div className="h-1.5 rounded-full bg-bg-elevated overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-accent-primary to-accent-secondary"
                          style={{ width: `${confidence}%` }}
                        />
                      </div>
                      <p className="text-xs text-text-tertiary mt-1">{entries.length} correction{entries.length !== 1 ? 's' : ''}</p>
                    </div>

                    {/* Sample corrections */}
                    <ul className="space-y-1.5">
                      {entries.slice(0, 4).map((entry, idx) => (
                        <li
                          key={`${category}-${idx}`}
                          className="text-xs text-text-secondary leading-relaxed line-clamp-2 pl-3 border-l-2 border-border-emphasis"
                        >
                          {entry}
                        </li>
                      ))}
                    </ul>

                    {entries.length > 4 && (
                      <p className="mt-3 text-xs text-text-tertiary">
                        +{entries.length - 4} more
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}
