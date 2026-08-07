import { useEffect, useState, useCallback } from 'react';
import { api } from '../../utils/api';
import { money } from '../../utils/money';
import type { GrillaCadena, Obligacion } from '../../types';

function fechaCorta(iso: string) {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

function celdaClase(obligacion: Obligacion | null) {
  if (!obligacion) return 'bg-surface-2 text-text-faint';
  if (obligacion.estado === 'PAGADA') return 'bg-success/15 text-success hover:bg-success/25';
  if (obligacion.estado === 'PARCIAL') return 'bg-warning/15 text-warning hover:bg-warning/25';
  return 'bg-error/10 text-error hover:bg-error/20';
}

export function CadenaGrid({ cadenaId }: { cadenaId: number }) {
  const [data, setData] = useState<GrillaCadena | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.get<GrillaCadena>(`/reportes/cadena/${cadenaId}/grilla`));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar la grilla');
    }
  }, [cadenaId]);

  useEffect(() => {
    load();
  }, [load]);

  async function pagarCompleto(obligacion: Obligacion) {
    if (obligacion.estado === 'PAGADA' || busyId) return;
    setBusyId(obligacion.id);
    try {
      await api.post('/pagos', {
        obligacion_id: obligacion.id,
        valor_pago: obligacion.saldo_pendiente,
        metodo_pago: 'Efectivo',
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar pago');
    } finally {
      setBusyId(null);
    }
  }

  async function entregarCompleto(entregaId: number, valorPendiente: number) {
    if (valorPendiente <= 0 || busyId) return;
    setBusyId(entregaId);
    try {
      await api.post('/entregas/registrar', { entrega_id: entregaId, valor_entregado: valorPendiente });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar entrega');
    } finally {
      setBusyId(null);
    }
  }

  if (error) return <p className="text-sm text-error">{error}</p>;
  if (!data) return <p className="text-text-muted">Cargando grilla...</p>;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-4 text-sm text-text-muted">
        <span>
          Caja: <b className="text-text">{money(data.caja)}</b>
        </span>
        <span className="text-text-faint">
          Click en una celda pendiente para marcarla como pagada/entregada por el valor completo.
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="text-left text-sm">
          <thead className="bg-surface-2 text-text-muted">
            <tr>
              <th className="sticky left-0 z-10 bg-surface-2 px-3 py-2 font-medium">Participante</th>
              <th className="px-3 py-2 font-medium">Puesto</th>
              {data.quincenas.map((q) => (
                <th key={q.id} className="whitespace-nowrap px-2 py-2 text-center font-medium">
                  {fechaCorta(q.fecha_programada)}
                </th>
              ))}
              <th className="whitespace-nowrap px-3 py-2 font-medium">Entrega</th>
            </tr>
          </thead>
          <tbody>
            {data.filas.map((fila) => (
              <tr key={fila.puesto_id} className="border-t border-border">
                <td className="sticky left-0 z-10 bg-surface px-3 py-2 font-medium text-text">{fila.participante}</td>
                <td className="px-3 py-2 text-text-muted">
                  {fila.numero_puesto}
                  {fila.fraccion < 1 ? ` (${fila.fraccion})` : ''}
                </td>
                {fila.celdas.map((obligacion, i) => (
                  <td key={data.quincenas[i].id} className="p-1 text-center">
                    <button
                      disabled={!obligacion || busyId === obligacion.id}
                      onClick={() => obligacion && pagarCompleto(obligacion)}
                      title={obligacion ? `${obligacion.estado} — esperado ${money(obligacion.valor_esperado)}` : 'Sin obligación'}
                      className={`h-8 w-16 rounded-md text-xs font-semibold transition-colors disabled:cursor-default ${celdaClase(obligacion)}`}
                    >
                      {obligacion?.estado === 'PAGADA' ? '✓' : obligacion ? money(obligacion.saldo_pendiente) : '—'}
                    </button>
                  </td>
                ))}
                <td className="p-1 text-center">
                  {fila.entrega && (
                    <button
                      disabled={fila.entrega.estado === 'ENTREGADA' || busyId === fila.entrega.id}
                      onClick={() =>
                        fila.entrega &&
                        entregarCompleto(fila.entrega.id, fila.entrega.valor_esperado - fila.entrega.valor_entregado)
                      }
                      title={`${fila.entrega.estado} — esperado ${money(fila.entrega.valor_esperado)}`}
                      className={`h-8 w-24 rounded-md text-xs font-semibold transition-colors disabled:cursor-default ${
                        fila.entrega.estado === 'ENTREGADA'
                          ? 'bg-success/15 text-success'
                          : 'bg-violet-role/15 text-violet-role hover:bg-violet-role/25'
                      }`}
                    >
                      {fila.entrega.estado === 'ENTREGADA' ? '✓ entregado' : money(fila.entrega.valor_esperado)}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
