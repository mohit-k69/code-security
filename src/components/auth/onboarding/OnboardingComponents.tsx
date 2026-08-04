import React from 'react';
import { motion } from 'motion/react';

// ─── Onboarding Image Component ───────────────────────────────────
// Clean, abstract 3D renders — metaphorical, not literal.
// Each image represents the FEELING of its page.

export function OnboardingImage({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="w-full flex justify-center items-center h-[340px] relative -mt-4 mb-6">
      <img
        src={src}
        alt={alt}
        className="h-full w-auto object-contain select-none pointer-events-none [mask-image:radial-gradient(circle_at_center,_black_50%,_transparent_100%)]"
        draggable={false}
      />
    </div>
  );
}

// ─── Step Dot Indicator ────────────────────────────────────────────

export function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <motion.div
          key={i}
          className="rounded-full"
          animate={{
            width: i === current ? 24 : 6,
            height: 6,
            backgroundColor: i === current ? '#3f2a24' : i < current ? '#c17f59' : '#e8ddd7',
          }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        />
      ))}
    </div>
  );
}

// ─── Slide Direction Helper ────────────────────────────────────────

export const slideVariants = {
  enterFromRight: { x: 80, opacity: 0 },
  enterFromLeft: { x: -80, opacity: 0 },
  center: { x: 0, opacity: 1 },
  exitToLeft: { x: -80, opacity: 0 },
  exitToRight: { x: 80, opacity: 0 },
};
