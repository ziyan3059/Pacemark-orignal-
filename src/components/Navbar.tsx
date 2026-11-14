"use client";

import React from 'react';
import { ContinuousTabs, TabItem } from './watermelon/continuous-tabs';

interface NavbarProps {
  activeTab: string;
  onSelectTab: (id: string) => void;
  tabs?: TabItem[];
  groupId?: string;
}

const DEFAULT_TABS: TabItem[] = [
  { id: 'tab-1', label: 'Tab 1' },
  { id: 'tab-2', label: 'Tab 2' },
  { id: 'tab-3', label: 'Tab 3' },
  { id: 'tab-4', label: 'Tab 4' },
];

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onSelectTab,
  tabs = DEFAULT_TABS,
  groupId = 'nav-tabs',
}) => {
  return (
    <>
      {/* Floating Center Island Header */}
      <header className="fixed top-5 left-1/2 -translate-x-1/2 z-50 w-auto max-w-[95vw] pointer-events-auto">
        <ContinuousTabs
          tabs={tabs}
          activeId={activeTab}
          onChange={onSelectTab}
          groupId={groupId}
        />
      </header>

      {/* Top spacing */}
      <div className="h-16 pointer-events-none" />
    </>
  );
};
