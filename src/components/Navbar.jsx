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
      <header className="fixed top-5 left-1/2 -translate-x-1/2 z-50 w-auto max-w-[95vw] pointer-events-auto">
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
