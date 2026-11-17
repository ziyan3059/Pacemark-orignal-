import React from 'react';

export const Footer = ({ highContrast = false }) => {
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
          className={`inline-flex items-center gap-2 font-semibold tracking-tight whitespace-nowrap shrink-0 ${
            highContrast ? 'text-black' : 'text-[#1D1D1F]'
          }`}
        >
          <img
            src="/assets/aistudio/p-logo_bc9ef1d9.svg"
            alt="PaceMark logo"
            className={`w-6 h-6 rounded-md object-contain bg-white shrink-0 ${
              highContrast ? 'border border-black' : 'border border-black/10'
            }`}
          />
          <span>PaceMark</span>
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
