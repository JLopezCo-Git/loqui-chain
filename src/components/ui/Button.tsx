import type { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost';
}

export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  const base = 'rounded-md px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50';
  const variants = {
    primary: 'bg-accent text-accent-ink hover:opacity-90',
    ghost: 'bg-surface-2 text-text hover:bg-surface-3',
  };
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}
