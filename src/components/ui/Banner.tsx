export function Banner({ kind = 'ok', children }: { kind?: 'ok' | 'warning' | 'error'; children: string }) {
  const styles = {
    ok: 'border-success/40 bg-success/10 text-success',
    warning: 'border-warning/40 bg-warning/10 text-warning',
    error: 'border-error/40 bg-error/10 text-error',
  };
  return <div className={`mb-4 rounded-md border px-3 py-2 text-sm ${styles[kind]}`}>{children}</div>;
}
