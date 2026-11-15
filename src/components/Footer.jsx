import React from 'react';

export const Footer = ({ highContrast = false, onNavigateTab }) => {
  return (
    <footer
      className={`py-8 px-6 text-xs ${
        highContrast
          ? 'bg-white text-black border-t-2 border-black'
          : 'border-t border-black/[0.08] bg-white/70 backdrop-blur-xl text-[#48484A]'
      }`}
    >
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div
          className={`font-semibold tracking-tight whitespace-nowrap shrink-0 ${
            highContrast ? 'text-black' : 'text-[#1D1D1F]'
          }`}
        >
          PaceMark
        </div>

        <div className="flex items-center gap-6 font-medium">
          <button
            type="button"
            onClick={() => onNavigateTab?.('how-it-works')}
            className={`transition-colors cursor-pointer whitespace-nowrap shrink-0 hover:underline ${
              highContrast ? 'text-black' : 'text-[#48484A] hover:text-[#1D1D1F]'
            }`}
          >
            Exam Engine
          </button>
          <button
            type="button"
            onClick={() => onNavigateTab?.('weakness-engine')}
            className={`transition-colors cursor-pointer whitespace-nowrap shrink-0 hover:underline ${
              highContrast ? 'text-black' : 'text-[#48484A] hover:text-[#1D1D1F]'
            }`}
          >
            Weakness Ranking
          </button>
          <button
            type="button"
            onClick={() => onNavigateTab?.('accessibility')}
            className={`transition-colors cursor-pointer whitespace-nowrap shrink-0 hover:underline ${
              highContrast ? 'text-black' : 'text-[#48484A] hover:text-[#1D1D1F]'
            }`}
          >
            Accessibility
          </button>
        </div>

        <div
          className={`whitespace-nowrap shrink-0 ${
            highContrast ? 'text-black' : 'text-[#48484A]'
          }`}
        >
          © 2026 PaceMark. Timed Revision &amp; Diagnostics.
        </div>
      </div>
    </footer>
  );
};
