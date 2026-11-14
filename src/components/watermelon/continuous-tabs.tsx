"use client";

import React, { useState, useEffect, type FC } from "react";
import { motion, LayoutGroup } from "motion/react";

/* ---------- Types ---------- */
export interface TabItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

export interface ContinuousTabsProps {
  tabs?: TabItem[];
  activeId?: string;
  defaultActiveId?: string;
  onChange?: (id: string) => void;
  className?: string;
  groupId?: string;
}

/* ---------- Defaults ---------- */
const DEFAULT_TABS: TabItem[] = [
  { id: "home", label: "Home" },
  { id: "tuner", label: "Tuner" },
  { id: "presets", label: "Presets" },
  { id: "architecture", label: "Architecture" },
  { id: "code", label: "Get Code" },
];

export const ContinuousTabs: FC<ContinuousTabsProps> = ({
  tabs = DEFAULT_TABS,
  activeId,
  defaultActiveId = "home",
  onChange,
  className = "",
  groupId = "continuous-tabs-group",
}) => {
  const [internalActive, setInternalActive] = useState<string>(activeId || defaultActiveId);
  const [isMounted, setIsMounted] = useState<boolean>(false);

  useEffect(() => {
    requestAnimationFrame(() => setIsMounted(true));
  }, []);

  useEffect(() => {
    if (activeId !== undefined) {
      setInternalActive(activeId);
    }
  }, [activeId]);

  const handleChange = (id: string) => {
    setInternalActive(id);
    onChange?.(id);
  };

  if (!isMounted) return null;

  return (
    <LayoutGroup id={groupId}>
      <nav
        role="tablist"
        aria-label="Primary navigation"
        className={`
          relative flex items-center gap-0.5 sm:gap-1 p-1 sm:p-1.5
          rounded-full
          border border-white/70 dark:border-white/10
          bg-white/70 dark:bg-[#1C1C1E]/75
          shadow-[0_8px_32px_rgba(0,0,0,0.07),inset_0_1px_0_rgba(255,255,255,0.85)]
          backdrop-blur-2xl
          ${className}
        `}
      >
        {tabs.map((tab) => {
          const isActive = internalActive === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => handleChange(tab.id)}
              className="relative px-3.5 py-1.5 sm:px-4.5 sm:py-2 rounded-full transition-colors duration-150 cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3] active:scale-[0.97]"
            >
              {/* Active sliding pill */}
              {isActive && (
                <motion.div
                  layoutId={`${groupId}-active-pill`}
                  layoutDependency={internalActive}
                  transition={{
                    type: "spring",
                    stiffness: 420,
                    damping: 30,
                    mass: 0.8,
                  }}
                  className="
                    absolute inset-0 rounded-full
                    bg-[#1D1D1F] dark:bg-white text-white dark:text-[#1D1D1F]
                    shadow-[0_2px_8px_rgba(0,0,0,0.16)]
                  "
                />
              )}

              {/* Text / Label */}
              <span
                className={`relative z-10 text-xs sm:text-[13.5px] font-semibold transition-colors duration-150 flex items-center gap-1.5 whitespace-nowrap tracking-tight
                  ${
                    isActive
                      ? "text-white dark:text-[#1D1D1F] font-bold"
                      : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-white"
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
