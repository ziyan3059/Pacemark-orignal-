import React from 'react';
import { motion } from 'motion/react';

export const FluidButton = ({
  variant = 'primary',
  size = 'md',
  highContrast = false,
  children,
  icon,
  className = '',
  onClick,
  ...buttonProps
}) => {
  const sizeStyles = {
    sm: 'px-3 py-1.5 text-xs rounded-lg gap-1.5 font-medium',
    md: 'px-4.5 py-2 text-sm rounded-xl gap-2 font-semibold',
    lg: 'px-5.5 py-2.5 text-[15px] rounded-2xl gap-2.5 font-semibold',
  }[size];

  const variantStyles = highContrast
    ? {
        primary:
          'bg-black text-white hover:bg-neutral-800 active:bg-black border-2 border-black shadow-none',
        secondary:
          'bg-white text-black hover:bg-neutral-100 border-2 border-black shadow-none',
        ghost:
          'bg-white text-black hover:bg-neutral-100 border border-black shadow-none',
      }[variant]
    : {
        primary:
          'bg-[#1D1D1F] text-white hover:bg-[#2C2C2E] active:bg-black border border-black/15 shadow-[0_1px_2px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.2)]',
        secondary:
          'bg-white/85 text-[#1D1D1F] hover:bg-white hover:text-black border border-black/12 backdrop-blur-xl shadow-[0_1px_4px_rgba(0,0,0,0.05),inset_0_1px_0_rgba(255,255,255,0.9)]',
        ghost:
          'bg-black/[0.05] text-[#1D1D1F] hover:bg-black/[0.09] border border-black/[0.08]',
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
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#005BB5] focus-visible:ring-offset-2
        ${sizeStyles}
        ${variantStyles}
        ${className}
      `}
      {...buttonProps}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span>{children}</span>
    </motion.button>
  );
};
