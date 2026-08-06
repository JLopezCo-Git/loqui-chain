import type { TableRow } from '../../types';

export function Table({ data }: { data: TableRow[] }) {
  if (!data || !data.length) {
    return <p className="py-4 text-sm text-text-faint">Sin datos.</p>;
  }
  const cols = Object.keys(data[0]);

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-sm">
        <thead className="bg-surface-2 text-text-muted">
          <tr>
            {cols.map((c) => (
              <th key={c} className="whitespace-nowrap px-3 py-2 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className="border-t border-border">
              {cols.map((c) => (
                <td key={c} className="whitespace-nowrap px-3 py-2 text-text">
                  {String(row[c] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
