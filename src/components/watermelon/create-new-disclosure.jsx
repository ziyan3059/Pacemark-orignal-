import React, { useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Add01Icon,
  Cancel01Icon,
  FileUploadIcon,
  TaskEdit01Icon,
  NoteIcon,
} from '@hugeicons/core-free-icons';
import { motion, AnimatePresence } from 'motion/react';

const GridActionItem = ({ icon, label, onClick, disabled, highContrast = false }) => {
  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={onClick}
      whileTap={{ scale: 0.94 }}
      transition={{ type: 'spring', stiffness: 500, damping: 25 }}
      className={`group flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl px-2 py-3.5 sm:py-4 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#005BB5] disabled:opacity-40 disabled:cursor-not-allowed ${
        highContrast ? 'hover:bg-neutral-200 text-black' : 'hover:bg-black/[0.06]'
      }`}
    >
      <div
        className={`transition-colors [&>svg]:size-6 sm:[&>svg]:size-7 ${
          highContrast
            ? 'text-black'
            : 'text-[#48484A] group-hover:text-[#005BB5]'
        }`}
      >
        {icon}
      </div>
      <span
        className={`text-[12px] sm:text-[13px] font-medium tracking-tight whitespace-nowrap ${
          highContrast ? 'text-black' : 'text-[#1D1D1F]'
        }`}
      >
        {label}
      </span>
    </motion.button>
  );
};

export const CreateNewDisclosure = ({
  items,
  initialOpen = false,
  triggerLabel = 'Upload your first PDF',
  headerTitle = 'Add Exam Material',
  triggerIcon,
  isBusy = false,
  highContrast = false,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(initialOpen);

  const defaultItems = [
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
  const gridColumnsClass =
    disclosureItems.length === 1
      ? 'grid-cols-1'
      : disclosureItems.length === 2
        ? 'grid-cols-2'
        : 'grid-cols-3';

  return (
    <div className={`inline-block ${className}`}>
      <AnimatePresence mode="popLayout" initial={false}>
        {!isOpen ? (
          <motion.button
            key="collapsed"
            type="button"
            disabled={isBusy}
            layoutId="create-new-disclosure-container"
            onClick={() => setIsOpen(true)}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            whileTap={{ scale: 0.98 }}
            style={{ borderRadius: 32 }}
            transition={{ type: 'spring', bounce: 0.1, duration: 0.35 }}
            className={`flex cursor-pointer items-center gap-2.5 px-5.5 py-3 sm:px-6.5 sm:py-3.5 text-sm sm:text-[15px] font-semibold whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#005BB5] disabled:opacity-60 disabled:cursor-wait ${
              highContrast
                ? 'bg-white border-2 border-black text-black hover:bg-neutral-100 shadow-none'
                : 'bg-white/85 border border-black/10 text-[#1D1D1F] shadow-[0_2px_12px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-2xl hover:bg-white hover:shadow-md'
            }`}
          >
            <motion.div layoutId="create-new-disclosure-label" className="flex items-center gap-2.5">
              {triggerIcon ?? (
                <HugeiconsIcon
                  icon={Add01Icon}
                  size={20}
                  className={highContrast ? 'text-black shrink-0' : 'text-[#005BB5] shrink-0'}
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
            className={`w-[min(100%,24rem)] sm:w-96 p-2 ${
              highContrast
                ? 'bg-white border-2 border-black text-black shadow-none'
                : 'bg-white/90 backdrop-blur-2xl border border-black/10 shadow-[0_20px_50px_rgba(0,0,0,0.14),inset_0_1px_0_rgba(255,255,255,0.95)]'
            }`}
          >
            <div className="flex items-center justify-between px-3.5 py-2.5">
              <motion.p
                layoutId="create-new-disclosure-label"
                className={`text-sm font-semibold tracking-tight ${
                  highContrast ? 'text-black' : 'text-[#1D1D1F]'
                }`}
              >
                {headerTitle}
              </motion.p>
              <motion.button
                type="button"
                aria-label="Close menu"
                onClick={() => setIsOpen(false)}
                whileTap={{ scale: 0.92 }}
                className={`flex h-6 w-6 cursor-pointer items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#005BB5] ${
                  highContrast
                    ? 'bg-black text-white hover:bg-neutral-800'
                    : 'bg-black/[0.08] hover:bg-black/[0.14]'
                }`}
              >
                <HugeiconsIcon
                  icon={Cancel01Icon}
                  size={14}
                  className={highContrast ? 'text-white' : 'text-[#1D1D1F]'}
                  strokeWidth={2.5}
                />
              </motion.button>
            </div>

            <div
              className={`grid ${gridColumnsClass} gap-1.5 rounded-[20px] p-2 ${
                highContrast ? 'bg-neutral-100 border border-black' : 'bg-black/[0.04]'
              }`}
            >
              {disclosureItems.map((actionItem) => (
                <GridActionItem
                  key={actionItem.label}
                  icon={actionItem.icon}
                  label={actionItem.label}
                  disabled={actionItem.disabled || isBusy}
                  highContrast={highContrast}
                  onClick={() => {
                    actionItem.onClick?.();
                    setIsOpen(false);
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
