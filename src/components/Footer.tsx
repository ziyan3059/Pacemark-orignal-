import React from 'react';

interface FooterProps {
  onAdminClick?: () => void;
  isAdminActive?: boolean;
}

export const Footer: React.FC<FooterProps> = ({
  onAdminClick,
  isAdminActive = false,
}) => {
  return (
    <footer className="border-t border-black/[0.06] dark:border-white/[0.08] py-8 px-6 bg-white/40 dark:bg-black/40 backdrop-blur-xl text-neutral-500 dark:text-neutral-400 text-xs">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="font-semibold text-[#1D1D1F] dark:text-[#F5F5F7] tracking-tight whitespace-nowrap shrink-0">
          Placeholder Brand
        </div>

        <div className="flex items-center gap-6 font-medium">
          <span className="hover:text-neutral-900 dark:hover:text-white transition-colors cursor-pointer whitespace-nowrap shrink-0">
            Link 1
          </span>
          <span className="hover:text-neutral-900 dark:hover:text-white transition-colors cursor-pointer whitespace-nowrap shrink-0">
            Link 2
          </span>
          <span className="hover:text-neutral-900 dark:hover:text-white transition-colors cursor-pointer whitespace-nowrap shrink-0">
            Link 3
          </span>
          {onAdminClick && (
            <button
              type="button"
              onClick={onAdminClick}
              className="text-neutral-800 dark:text-neutral-200 hover:text-[#0071E3] dark:hover:text-[#0071E3] font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3] rounded-md px-1"
            >
              {isAdminActive ? 'Admin Console' : 'Admin'}
            </button>
          )}
        </div>

        <div className="text-neutral-400 dark:text-neutral-500 whitespace-nowrap shrink-0">
          © 2026 Placeholder Inc. All rights reserved.
        </div>
      </div>
    </footer>
  );
};
