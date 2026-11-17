import React from 'react';
import { ContinuousTabs } from './watermelon/continuous-tabs';

export const Navbar = ({
  activeTab,
  onSelectTab,
  tabs,
  highContrast = false,
  groupId = 'nav-tabs',
}) => {
  return (
    <>
      <header className="fixed top-5 left-1/2 -translate-x-1/2 z-50 w-auto max-w-[95vw] pointer-events-auto flex items-center gap-2">
        <div
          className={`hidden sm:inline-flex items-center justify-center w-10 h-10 rounded-full bg-white p-0.5 shrink-0 ${
            highContrast
              ? 'border-2 border-black'
              : 'border border-black/10 shadow-[0_8px_32px_rgba(0,0,0,0.08)]'
          }`}
        >
          <img
            src="/assets/aistudio/p-logo_bc9ef1d9.svg"
            alt="PaceMark logo"
            className="w-full h-full object-contain"
          />
        </div>

        <ContinuousTabs
          tabs={tabs}
          activeId={activeTab}
          onChange={onSelectTab}
          highContrast={highContrast}
          groupId={groupId}
        />
      </header>

      <div className="h-16 pointer-events-none" />
    </>
  );
};
