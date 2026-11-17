import React from 'react';
import { FluidButton } from './ui/fluid-button';
import { motion } from 'motion/react';
import { ArrowRight } from 'lucide-react';

export const Hero = ({
  onPrimaryAction,
  highContrast = false,
}) => {
  return (
    <section className="relative pt-16 pb-20 md:pt-24 md:pb-28 px-6 overflow-hidden">
      <div className="max-w-4xl mx-auto text-center flex flex-col items-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 28 }}
          className={`mb-7 w-16 h-16 sm:w-18 sm:h-18 rounded-[20px] p-1 bg-white flex items-center justify-center ${
            highContrast
              ? 'border-2 border-black'
              : 'border border-black/10 shadow-[0_12px_30px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.95)]'
          }`}
        >
          <img
            src="/assets/aistudio/p-logo_bc9ef1d9.svg"
            alt="PaceMark logo"
            className="w-full h-full object-contain"
          />
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
        </motion.div>
      </div>
    </section>
  );
};
