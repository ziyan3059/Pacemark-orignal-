"use client";

import React from 'react';
import { motion, HTMLMotionProps } from 'motion/react';

interface FluidButtonProps extends HTMLMotionProps<'button'> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  icon?: React.ReactNode;
}

export const FluidButton: React.FC<FluidButtonProps> = ({
  variant = 'primary',
  size = 'md',
  children,
  icon,
  className = '',
  onClick,
  ...rest
}) => {
  const sizeStyles = {
    sm: 'px-3 py-1.5 text-xs rounded-lg gap-1.5 font-medium',
    md: 'px-4.5 py-2 text-sm rounded-xl gap-2 font-semibold',
    lg: 'px-5.5 py-2.5 text-[15px] rounded-2xl gap-2.5 font-semibold',
  }[size];

  const variantStyles = {
    primary:
      'bg-[#1D1D1F] text-white hover:bg-[#2C2C2E] active:bg-[#000000] border border-black/10 shadow-[0_1px_2px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.2)] dark:bg-white dark:text-[#1D1D1F] dark:hover:bg-[#F5F5F7] dark:shadow-[0_1px_2px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.8)]',
    secondary:
      'bg-white/70 text-neutral-900 hover:bg-white hover:text-black border border-black/8 backdrop-blur-xl shadow-[0_1px_4px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.7)] dark:bg-white/10 dark:text-white dark:border-white/15 dark:hover:bg-white/15',
    ghost:
      'bg-black/[0.04] text-neutral-800 hover:bg-black/[0.08] border border-black/[0.04] dark:bg-white/[0.08] dark:text-neutral-200 dark:hover:bg-white/[0.12] dark:border-white/[0.06]',
  }[variant];

  return (
    <motion.button
      whileHover={{ y: -0.5 }}
      whileTap={{
        scale: 0.97,
        transition: { type: 'spring', stiffness: 500, damping: 25 },
      }}
      transition={{
        type: 'spring',
        stiffness: 420,
        damping: 28,
        mass: 0.8,
      }}
      onClick={onClick}
      className={`
        relative inline-flex items-center justify-center tracking-tight
        cursor-pointer select-none whitespace-nowrap shrink-0 transition-colors
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3] focus-visible:ring-offset-2
        ${sizeStyles}
        ${variantStyles}
        ${className}
      `}
      {...rest}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span>{children}</span>
    </motion.button>
  );
};
