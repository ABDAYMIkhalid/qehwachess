import { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-brand-500 hover:bg-brand-600 text-white shadow-lg shadow-brand-500/25 hover:shadow-brand-500/40 transition-all',
  secondary:
    'bg-surface-900/80 hover:bg-surface-800 text-gray-200 border border-surface-700 hover:border-brand-500/50 hover:text-white shadow-sm transition-all',
  ghost:
    'bg-transparent hover:bg-white/5 text-gray-300 hover:text-white transition-all',
  danger:
    'bg-error-500/90 hover:bg-error-500 text-white transition-all',
  outline:
    'bg-transparent border border-brand-500/50 hover:border-brand-400 hover:bg-brand-500/10 text-brand-300 hover:text-brand-200 transition-all',
};

const sizeClasses: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-sm rounded-lg',
  md: 'px-5 py-2.5 text-sm rounded-xl',
  lg: 'px-7 py-3.5 text-base rounded-xl',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
