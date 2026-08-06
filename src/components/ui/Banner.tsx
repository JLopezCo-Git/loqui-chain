export function Banner({ kind = 'ok', children }: { kind?: 'ok' | 'error'; children: string }) {
  const styles =
    kind === 'ok'
      ? 'border-success/40 bg-success/10 text-success'
      : 'border-error/40 bg-error/10 text-error';
  return <div className={`mb-4 rounded-md border px-3 py-2 text-sm ${styles}`}>{children}</div>;
}
