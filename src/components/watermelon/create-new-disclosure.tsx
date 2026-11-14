"use client";

import React, { useState, type FC, type ReactNode } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Add01Icon,
  Cancel01Icon,
  FileUploadIcon,
  TaskEdit01Icon,
  NoteIcon,
} from '@hugeicons/core-free-icons';
import { motion, AnimatePresence } from 'motion/react';

export interface DisclosureItem {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}

export interface CreateNewDisclosureProps {
  items?: DisclosureItem[];
  initialOpen?: boolean;
  triggerLabel?: string;
  headerTitle?: string;
  triggerIcon?: ReactNode;
  isBusy?: boolean;
  className?: string;
}

interface GridItemProps {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}

const GridItem: FC<GridItemProps> = ({ icon, label, onClick, disabled }) => {
  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={onClick}
      whileTap={{ scale: 0.94 }}
      transition={{ type: 'spring', stiffness: 500, damping: 25 }}
      className="group flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl px-2 py-3.5 sm:py-4 transition-all duration-150 hover:bg-black/[0.04] dark:hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3] disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <div className="text-neutral-500 dark:text-neutral-400 transition-colors group-hover:text-[#0071E3] dark:group-hover:text-white [&>svg]:size-6 sm:[&>svg]:size-7">
        {icon}
      </div>
      <span className="text-[12px] sm:text-[13px] font-medium tracking-tight text-neutral-800 dark:text-neutral-200 whitespace-nowrap">
        {label}
      </span>
    </motion.button>
  );
};

export const CreateNewDisclosure: FC<CreateNewDisclosureProps> = ({
  items,
  initialOpen = false,
  triggerLabel = 'Upload your first PDF',
  headerTitle = 'Add Exam Material',
  triggerIcon,
  isBusy = false,
  className = '',
}) => {
  const [open, setOpen] = useState<boolean>(initialOpen);

  const defaultItems: DisclosureItem[] = [
    {
      icon: <HugeiconsIcon icon={FileUploadIcon} strokeWidth={1.6} />,
      label: 'Upload PDF',
    },
    {
      icon: <HugeiconsIcon icon={TaskEdit01Icon} strokeWidth={1.6} />,
      label: 'Timed Mock',
    },
    {
      icon: <HugeiconsIcon icon={NoteIcon} strokeWidth={1.6} />,
      label: 'Preview Text',
    },
  ];

  const disclosureItems = items || defaultItems;
  const gridColsClass = disclosureItems.length <= 3 ? 'grid-cols-3' : 'grid-cols-3';

  return (
    <div className={`inline-block ${className}`}>
      <AnimatePresence mode="popLayout" initial={false}>
        {!open ? (
          <motion.button
            key="collapsed"
            type="button"
            disabled={isBusy}
            layoutId="create-new-disclosure-container"
            onClick={() => setOpen(true)}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            whileTap={{ scale: 0.98 }}
            style={{ borderRadius: 32 }}
            transition={{ type: 'spring', bounce: 0.1, duration: 0.35 }}
            className="flex cursor-pointer items-center gap-2.5 bg-white/75 dark:bg-[#1C1C1E]/80 border border-white/80 dark:border-white/10 px-5.5 py-3 sm:px-6.5 sm:py-3.5 text-sm sm:text-[15px] font-semibold whitespace-nowrap text-neutral-900 dark:text-neutral-100 shadow-[0_2px_12px_rgba(0,0,0,0.05),inset_0_1px_0_rgba(255,255,255,0.85)] backdrop-blur-2xl hover:bg-white dark:hover:bg-[#2C2C2E] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3] disabled:opacity-60 disabled:cursor-wait"
          >
            <motion.div layoutId="create-new-disclosure-label" className="flex items-center gap-2.5">
              {triggerIcon ?? (
                <HugeiconsIcon
                  icon={Add01Icon}
                  size={20}
                  className="text-[#0071E3] shrink-0"
                  strokeWidth={2.2}
                />
              )}
              <span className="tracking-tight">{triggerLabel}</span>
            </motion.div>
          </motion.button>
        ) : (
          <motion.div
            key="expanded"
            layoutId="create-new-disclosure-container"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            style={{ borderRadius: 26 }}
            transition={{ type: 'spring', bounce: 0.1, duration: 0.35 }}
            className="w-[min(100%,24rem)] sm:w-96 bg-white/80 dark:bg-[#1C1C1E]/90 backdrop-blur-2xl border border-white/80 dark:border-white/10 p-2 shadow-[0_20px_50px_rgba(0,0,0,0.14),inset_0_1px_0_rgba(255,255,255,0.9)]"
          >
            <div className="flex items-center justify-between px-3.5 py-2.5">
              <motion.p
                layoutId="create-new-disclosure-label"
                className="text-sm font-semibold tracking-tight text-neutral-900 dark:text-neutral-100"
              >
                {headerTitle}
              </motion.p>
              <motion.button
                type="button"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
                whileTap={{ scale: 0.92 }}
                className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-black/[0.08] hover:bg-black/[0.14] dark:bg-white/[0.12] dark:hover:bg-white/[0.2] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3]"
              >
                <HugeiconsIcon
                  icon={Cancel01Icon}
                  size={14}
                  className="text-neutral-700 dark:text-neutral-200"
                  strokeWidth={2.5}
                />
              </motion.button>
            </div>

            <div className={`grid ${gridColsClass} gap-1.5 rounded-[20px] bg-black/[0.03] dark:bg-white/[0.04] p-2`}>
              {disclosureItems.map((item, index) => (
                <GridItem
                  key={index}
                  icon={item.icon}
                  label={item.label}
                  disabled={item.disabled || isBusy}
                  onClick={() => {
                    item.onClick?.();
                    setOpen(false);
                  }}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
