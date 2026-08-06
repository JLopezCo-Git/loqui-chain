export function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-token-1">
      <span className="block text-xs font-medium text-text-muted">{label}</span>
      <b className="mt-1 block text-2xl font-bold text-text">{value}</b>
    </div>
  );
}
