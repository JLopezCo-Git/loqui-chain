export function StatCard({
  label,
  value,
  hero = false,
  tone = 'neutral',
}: {
  label: string;
  value: string | number;
  hero?: boolean;
  tone?: 'neutral' | 'warning' | 'error';
}) {
  const toneClass = { neutral: 'text-text', warning: 'text-warning', error: 'text-error' }[tone];
  return (
    <div className={`rounded-lg border border-border bg-surface shadow-token-1 ${hero ? 'p-5' : 'p-4'}`}>
      <span className="block text-xs font-medium text-text-muted">{label}</span>
      <b className={`mt-1 block font-bold ${hero ? 'text-3xl' : 'text-2xl'} ${toneClass}`}>{value}</b>
    </div>
  );
}
