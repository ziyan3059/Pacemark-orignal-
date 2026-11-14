"use client";

import React from 'react';
import { FluidButton } from './ui/fluid-button';
import { motion } from 'motion/react';
import { ArrowUpRight } from 'lucide-react';

interface CardItem {
  id: string;
  title: string;
  description: string;
  kicker: string;
}

const CARDS: CardItem[] = [
  {
    id: 'card-1',
    kicker: 'Section 01',
    title: 'Placeholder Card 1',
    description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna.',
  },
  {
    id: 'card-2',
    kicker: 'Section 02',
    title: 'Placeholder Card 2',
    description: 'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
  },
  {
    id: 'card-3',
    kicker: 'Section 03',
    title: 'Placeholder Card 3',
    description: 'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur excepteur.',
  },
];

export const PlaceholderCards: React.FC = () => {
  return (
    <section className="relative py-14 px-6 max-w-6xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {CARDS.map((card, idx) => (
          <motion.div
            key={card.id}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ y: -2 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28, delay: 0.08 * idx }}
            className="rounded-[24px] bg-white/70 dark:bg-[#1C1C1E]/70 border border-white/80 dark:border-white/10 p-7 flex flex-col justify-between backdrop-blur-2xl transition-shadow duration-200 shadow-[0_8px_30px_rgba(0,0,0,0.05),inset_0_1px_0_rgba(255,255,255,0.85)] hover:shadow-[0_16px_40px_rgba(0,0,0,0.08)]"
          >
            <div>
              <span className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 block mb-2 tracking-wider uppercase">
                {card.kicker}
              </span>
              <h3 className="text-xl font-bold tracking-tight text-[#1D1D1F] dark:text-[#F5F5F7] mb-2.5">
                {card.title}
              </h3>
              <p className="text-[14px] text-neutral-600 dark:text-neutral-400 leading-relaxed font-normal">
                {card.description}
              </p>
            </div>

            <div className="mt-8 pt-4 border-t border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between">
              <span className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">Placeholder Label</span>
              <FluidButton
                variant="ghost"
                size="sm"
                icon={<ArrowUpRight className="w-3.5 h-3.5 text-neutral-800 dark:text-neutral-200" />}
              >
                Action
              </FluidButton>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
};
