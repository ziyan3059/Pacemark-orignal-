import React from 'react';
import { FluidButton } from './ui/fluid-button';
import { motion } from 'motion/react';
import { ArrowRight } from 'lucide-react';

export const Hero = ({
  onPrimaryAction,
  onSecondaryAction,
  signedInUser,
  highContrast = false,
}) => {
  return (
    <section className="relative pt-16 pb-20 md:pt-24 md:pb-28 px-6 overflow-hidden">
      <div className="max-w-4xl mx-auto text-center flex flex-col items-center">
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className={`text-xs font-semibold mb-6 tracking-wide uppercase px-3.5 py-1.5 rounded-full ${
            highContrast
              ? 'bg-white text-black border-2 border-black shadow-none'
              : 'text-[#1D1D1F] bg-white/85 backdrop-blur-xl border border-black/10 shadow-xs'
          }`}
        >
          <span>
            {signedInUser ? `Signed in · ${signedInUser}` : 'PaceMark · Timed Exam Diagnostics'}
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 30, delay: 0.08 }}
          className={`text-4xl sm:text-5xl md:text-6xl font-bold tracking-[-0.03em] leading-[1.08] max-w-3xl ${
            highContrast ? 'text-black' : 'text-[#1D1D1F]'
          }`}
          style={{ textWrap: 'balance' }}
        >
          Master Exam Pacing &amp; Target Your Weakest Topics
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 30, delay: 0.16 }}
          className={`mt-6 text-base sm:text-lg font-normal max-w-2xl leading-relaxed tracking-tight ${
            highContrast ? 'text-black' : 'text-[#3A3A3C]'
          }`}
        >
          Upload PDF past papers or practice built-in OCR computer science mocks with live per-question timing, keyword rubric marking, and exportable PDF diagnostics.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 30, delay: 0.24 }}
          className="mt-9 flex flex-wrap items-center justify-center gap-3.5"
        >
          <FluidButton
            variant="primary"
            size="lg"
            highContrast={highContrast}
            icon={<ArrowRight className="w-4 h-4" />}
            onClick={onPrimaryAction}
          >
            Sign In to Practice
          </FluidButton>

          <FluidButton
            variant="secondary"
            size="lg"
            highContrast={highContrast}
            onClick={onSecondaryAction}
          >
            How It Works
          </FluidButton>
        </motion.div>
      </div>
    </section>
  );
};
