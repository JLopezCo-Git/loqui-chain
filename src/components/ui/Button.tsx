import type { ButtonHTMLAttributes, Ref } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger' | 'icon';
  loading?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

const RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface';

export function Button({ variant = 'primary', loading = false, disabled, className = '', children, ref, ...props }: ButtonProps) {
  const base = `inline-flex items-center justify-center gap-2 rounded-md text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${RING}`;
  const variants = {
    primary: 'px-4 py-2 bg-accent text-accent-ink hover:opacity-90',
    ghost: 'px-4 py-2 bg-surface-2 text-text hover:bg-surface-3',
    danger: 'px-4 py-2 bg-error/10 text-error hover:bg-error/20',
    // Botón solo-ícono/símbolo: 24x24 mínimo (WCAG 2.5.8). SIEMPRE pasar aria-label.
    icon: 'h-6 w-6 shrink-0 bg-transparent text-text-faint hover:bg-surface-3 hover:text-error',
  };
  return (
    <button ref={ref} className={`${base} ${variants[variant]} ${className}`} disabled={disabled || loading} {...props}>
      {loading && (
        <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
      )}
      {children}
    </button>
  );
}
