"use client";

import React from 'react';
import { FluidButton } from './ui/fluid-button';
import { motion } from 'motion/react';
import { ArrowRight } from 'lucide-react';

interface HeroProps {
  onButton1Click?: () => void;
  onButton2Click?: () => void;
  signedInUser?: string | null;
}

export const Hero: React.FC<HeroProps> = ({
  onButton1Click,
  onButton2Click,
  signedInUser,
}) => {
  return (
    <section className="relative pt-16 pb-20 md:pt-24 md:pb-28 px-6 overflow-hidden">
      <div className="max-w-4xl mx-auto text-center flex flex-col items-center">
        {/* Apple style kicker */}
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-6 tracking-wide uppercase px-3.5 py-1.5 rounded-full bg-white/70 dark:bg-white/10 backdrop-blur-xl border border-black/5 dark:border-white/10 shadow-xs"
        >
          <span>{signedInUser ? `Signed in · ${signedInUser}` : 'Category · Placeholder Tag'}</span>
        </motion.div>

        {/* Apple display headline */}
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 30, delay: 0.08 }}
          className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-[-0.03em] text-[#1D1D1F] dark:text-[#F5F5F7] leading-[1.08] max-w-3xl"
          style={{ textWrap: 'balance' }}
        >
          Lorem Ipsum Dolor Sit Amet Consectetur
        </motion.h1>

        {/* Apple body copy */}
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 30, delay: 0.16 }}
          className="mt-6 text-base sm:text-lg text-neutral-700 dark:text-neutral-300 font-normal max-w-2xl leading-relaxed tracking-tight"
        >
          Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore.
        </motion.p>

        {/* Fluid spring buttons */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 30, delay: 0.24 }}
          className="mt-9 flex flex-wrap items-center justify-center gap-3.5"
        >
          <FluidButton
            variant="primary"
            size="lg"
            icon={<ArrowRight className="w-4 h-4" />}
            onClick={onButton1Click}
          >
            Button 1
          </FluidButton>

          <FluidButton
            variant="secondary"
            size="lg"
            onClick={onButton2Click}
          >
            Button 2
          </FluidButton>
        </motion.div>
      </div>
    </section>
  );
};
