import React from 'react';
import { motion } from 'motion/react';

const FEATURE_CARDS = [
  {
    id: 'pdf-parser',
    kicker: '01 · PDF Extraction',
    title: 'Multi-Column Question Parser',
    description:
      'Extracts numbered questions, mark allocations, and topic tags directly from uploaded exam PDFs with target pacing per mark.',
    tag: 'Supports OCR & standard PDFs',
  },
  {
    id: 'weakness-engine',
    kicker: '02 · Pacing & Rubric',
    title: 'Priority Weakness Ranking',
    description:
      'Combines 60% time-spent ratio against target with 40% lost marks after rubric review to surface what you should revise first.',
    tag: 'Downloadable PDF & CSV',
  },
  {
    id: 'accessibility-tools',
    kicker: '03 · Accessible Workspace',
    title: 'Focus-Gated Timer & Draft Safety',
    description:
      'Runs the 1-minute-per-mark countdown only while typing, with High Contrast black-on-white mode, 5-second local draft auto-save, and Alt+N / Alt+P shortcuts.',
    tag: 'WCAG-aligned controls',
  },
];

export const FeatureCards = ({ highContrast = false }) => {
  return (
    <section className="relative py-14 px-6 max-w-6xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {FEATURE_CARDS.map((card, cardIndex) => (
          <motion.div
            key={card.id}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ y: -2 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28, delay: 0.08 * cardIndex }}
            className={`rounded-[24px] p-7 flex flex-col justify-between transition-shadow duration-200 ${
              highContrast
                ? 'bg-white border-2 border-black text-black shadow-none'
                : 'bg-white/82 border border-black/8 backdrop-blur-2xl shadow-[0_8px_30px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.9)] hover:shadow-[0_16px_40px_rgba(0,0,0,0.09)]'
            }`}
          >
            <div>
              <span
                className={`text-[11px] font-semibold block mb-2 tracking-wider uppercase ${
                  highContrast ? 'text-black' : 'text-[#48484A]'
                }`}
              >
                {card.kicker}
              </span>
              <h3
                className={`text-xl font-bold tracking-tight mb-2.5 ${
                  highContrast ? 'text-black' : 'text-[#1D1D1F]'
                }`}
              >
                {card.title}
              </h3>
              <p
                className={`text-[14px] leading-relaxed font-normal ${
                  highContrast ? 'text-black' : 'text-[#3A3A3C]'
                }`}
              >
                {card.description}
              </p>
            </div>

            <div
              className={`mt-8 pt-4 border-t ${
                highContrast ? 'border-black' : 'border-black/[0.08]'
              }`}
            >
              <span
                className={`text-xs font-medium ${
                  highContrast ? 'text-black' : 'text-[#48484A]'
                }`}
              >
                {card.tag}
              </span>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
};
