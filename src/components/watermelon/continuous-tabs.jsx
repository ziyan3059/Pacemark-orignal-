import React, { useState, useEffect } from 'react';
import { motion, LayoutGroup } from 'motion/react';

export const ContinuousTabs = ({
  tabs,
  activeId,
  defaultActiveId = 'overview',
  onChange,
  highContrast = false,
  className = '',
  groupId = 'continuous-tabs-group',
}) => {
  const resolvedTabs = tabs && tabs.length > 0 ? tabs : [];
  const [internalActive, setInternalActive] = useState(
    activeId || defaultActiveId || resolvedTabs[0]?.id || '',
  );
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setIsMounted(true));
  }, []);

  useEffect(() => {
    if (activeId !== undefined) {
      setInternalActive(activeId);
    }
  }, [activeId]);

  const handleSelectTab = (tabId) => {
    setInternalActive(tabId);
    onChange?.(tabId);
  };

  if (!isMounted || resolvedTabs.length === 0) return null;

  return (
    <LayoutGroup id={groupId}>
      <nav
        role="tablist"
        aria-label="Primary navigation"
        className={`
          relative flex items-center gap-0.5 sm:gap-1 p-1 sm:p-1.5 rounded-full
          ${
            highContrast
              ? 'bg-white border-2 border-black shadow-none'
              : 'border border-black/10 bg-white/85 shadow-[0_8px_32px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-2xl'
          }
          ${className}
        `}
      >
        {resolvedTabs.map((tab) => {
          const isActive = internalActive === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => handleSelectTab(tab.id)}
              className="relative px-3.5 py-1.5 sm:px-4.5 sm:py-2 rounded-full transition-colors duration-150 cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#005BB5] active:scale-[0.97]"
            >
              {isActive && (
                <motion.div
                  layoutId={`${groupId}-active-pill`}
                  layoutDependency={internalActive}
                  transition={{
                    type: 'spring',
                    stiffness: 420,
                    damping: 30,
                    mass: 0.8,
                  }}
                  className={`absolute inset-0 rounded-full ${
                    highContrast
                      ? 'bg-black'
                      : 'bg-[#1D1D1F] shadow-[0_2px_8px_rgba(0,0,0,0.16)]'
                  }`}
                />
              )}

              <span
                className={`relative z-10 text-xs sm:text-[13.5px] font-semibold transition-colors duration-150 flex items-center gap-1.5 whitespace-nowrap tracking-tight
                  ${
                    isActive
                      ? 'text-white font-bold'
                      : highContrast
                        ? 'text-black hover:underline'
                        : 'text-[#48484A] hover:text-[#1D1D1F]'
                  }
                `}
              >
                {tab.icon && <span className="shrink-0">{tab.icon}</span>}
                {tab.label}
              </span>
            </button>
          );
        })}
      </nav>
    </LayoutGroup>
  );
};
