import { useState } from 'react';
import { motion, useAnimation, useMotionValue, useTransform } from 'motion/react';

interface SwipeApprovalCardProps {
  title: string;
  content: string;
  onApprove: () => void;
  onReject: () => void;
}

export function SwipeApprovalCard({ title, content, onApprove, onReject }: SwipeApprovalCardProps) {
  const controls = useAnimation();
  const x = useMotionValue(0);
  const [locked, setLocked] = useState(false);

  const approveOpacity = useTransform(x, [20, 120], [0, 1]);
  const rejectOpacity = useTransform(x, [-20, -120], [0, 1]);

  return (
    <div className="relative mx-auto w-full max-w-xl">
      <motion.div
        style={{ opacity: approveOpacity }}
        className="pointer-events-none absolute -top-3 right-4 z-10 rounded-full bg-success/90 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white"
      >
        Approve & Publish
      </motion.div>
      <motion.div
        style={{ opacity: rejectOpacity }}
        className="pointer-events-none absolute -top-3 left-4 z-10 rounded-full bg-warning/90 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white"
      >
        Needs Rewrite
      </motion.div>

      <motion.div
        drag={locked ? false : 'x'}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.25}
        style={{ x }}
        animate={controls}
        onDragEnd={async (_, info) => {
          if (locked) return;

          if (info.offset.x > 100) {
            setLocked(true);
            await controls.start({ x: 360, opacity: 0, transition: { duration: 0.22 } });
            onApprove();
            return;
          }

          if (info.offset.x < -100) {
            setLocked(true);
            await controls.start({ x: -360, opacity: 0, transition: { duration: 0.22 } });
            onReject();
            return;
          }

          controls.start({ x: 0, transition: { type: 'spring', stiffness: 320, damping: 24 } });
        }}
        className="rounded-2xl border border-border-default bg-white p-5 shadow-md"
      >
        <h3 className="mb-3 text-sm font-semibold text-text-primary">{title}</h3>
        <p className="max-h-72 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-text-primary">{content || 'No content available yet.'}</p>
      </motion.div>
    </div>
  );
}
