import { useEffect, useState, useCallback, useMemo } from 'react';
import { api } from '../../utils/api';
import { money } from '../../utils/money';
import { ConfirmPopover } from '../ui/ConfirmPopover';
import type { GrillaCadena, Obligacion, Entrega } from '../../types';

function fechaCorta(iso: string) {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

type EstadoCelda = 'sin-obligacion' | 'pagada' | 'parcial' | 'proxima' | 'vencida';

function estadoCelda(obligacion: Obligacion | null, fechaLimite: string, hoy: string): EstadoCelda {
  if (!obligacion) return 'sin-obligacion';
  if (obligacion.estado === 'PAGADA') return 'pagada';
  if (fechaLimite < hoy) return 'vencida';
  if (obligacion.estado === 'PARCIAL') return 'parcial';
  return 'proxima';
}

const ESTILO_CELDA: Record<EstadoCelda, string> = {
  'sin-obligacion': 'bg-surface-2 text-text-faint',
  pagada: 'bg-success/15 text-success hover:bg-success/25',
  parcial: 'bg-warning/20 text-warning hover:bg-warning/30 ring-1 ring-inset ring-warning/40',
  proxima: 'bg-surface-3 text-text-muted hover:bg-border-strong',
  vencida: 'bg-error/15 text-error hover:bg-error/25 ring-1 ring-inset ring-error/40',
};

const ETIQUETA_ESTADO: Record<EstadoCelda, string> = {
  'sin-obligacion': 'sin obligación',
  pagada: 'pagada',
  parcial: 'pago parcial',
  proxima: 'pendiente, dentro de plazo',
  vencida: 'vencida',
};

export function CadenaGrid({ cadenaId }: { cadenaId: number }) {
  const [data, setData] = useState<GrillaCadena | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [confirmPago, setConfirmPago] = useState<Obligacion | null>(null);
  const [confirmEntrega, setConfirmEntrega] = useState<Entrega | null>(null);
  const [buscar, setBuscar] = useState('');

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

  const hoy = new Date().toISOString().slice(0, 10);

  const quincenaActualId = useMemo(() => {
    if (!data) return null;
    const proxima = data.quincenas.find((q) => q.fecha_limite_pago >= hoy);
    return proxima ? proxima.id : data.quincenas.at(-1)?.id ?? null;
  }, [data, hoy]);

  async function confirmarPago() {
    if (!confirmPago || !data) return;
    const obligacion = confirmPago;
    setBusyId(obligacion.id);
    // Actualización optimista: refleja el pago antes de que vuelva la red.
    setData({
      ...data,
      filas: data.filas.map((f) => ({
        ...f,
        celdas: f.celdas.map((c) => (c?.id === obligacion.id ? { ...c, estado: 'PAGADA', valor_pagado: c.valor_esperado, saldo_pendiente: 0 } : c)),
      })),
    });
    setConfirmPago(null);
    try {
      await api.post('/pagos', { obligacion_id: obligacion.id, valor_pago: obligacion.saldo_pendiente, metodo_pago: 'Efectivo' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar pago');
      await load(); // revertir el optimismo si falló
    } finally {
      setBusyId(null);
    }
  }

  async function confirmarEntrega() {
    if (!confirmEntrega) return;
    const entrega = confirmEntrega;
    setBusyId(entrega.id);
    setConfirmEntrega(null);
    try {
      await api.post('/entregas/registrar', { entrega_id: entrega.id, valor_entregado: entrega.valor_esperado - entrega.valor_entregado });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar entrega');
    } finally {
      setBusyId(null);
    }
  }

  if (error) return <p className="text-sm text-error">{error}</p>;
  if (!data) return <p className="text-text-muted">Cargando grilla...</p>;

  const filasFiltradas = data.filas.filter((f) => f.participante.toLowerCase().includes(buscar.toLowerCase()));

  const totalesPorQuincena = data.quincenas.map((_, i) =>
    data.filas.reduce((sum, f) => sum + (f.celdas[i]?.valor_pagado || 0), 0),
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4 text-sm text-text-muted">
          <span>
            Caja: <b className="text-text">{money(data.caja)}</b>
          </span>
          <span className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-success" /> pagada
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-warning" /> parcial
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-error" /> vencida
            </span>
          </span>
        </div>
        <input
          type="search"
          placeholder="Buscar participante..."
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          className="w-48 rounded-md border border-border bg-surface-2 px-3 py-1.5 text-sm text-text placeholder:text-text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="text-left text-sm">
          <thead className="bg-surface-2 text-text-muted">
            <tr>
              <th className="sticky left-0 z-10 bg-surface-2 px-3 py-2 font-medium">Participante</th>
              <th className="px-3 py-2 font-medium">Puesto</th>
              {data.quincenas.map((q) => (
                <th
                  key={q.id}
                  className={`whitespace-nowrap px-2 py-2 text-center font-medium ${q.id === quincenaActualId ? 'bg-accent/15 text-accent' : ''}`}
                >
                  {fechaCorta(q.fecha_programada)}
                  {q.id === quincenaActualId && <span className="block text-[10px] font-normal">actual</span>}
                </th>
              ))}
              <th className="whitespace-nowrap px-3 py-2 font-medium">Entrega</th>
            </tr>
          </thead>
          <tbody>
            {filasFiltradas.map((fila) => {
              const totalPagado = fila.celdas.reduce((s, c) => s + (c?.valor_pagado || 0), 0);
              const totalEsperado = fila.celdas.reduce((s, c) => s + (c?.valor_esperado || 0), 0);
              const progreso = totalEsperado ? Math.round((totalPagado / totalEsperado) * 100) : 0;
              return (
                <tr key={fila.puesto_id} className="border-t border-border">
                  <td className="sticky left-0 z-10 bg-surface px-3 py-2 font-medium text-text">
                    {fila.participante}
                    <span className="ml-2 text-xs font-normal text-text-faint">{progreso}%</span>
                  </td>
                  <td className="px-3 py-2 text-text-muted">
                    {fila.numero_puesto}
                    {fila.fraccion < 1 ? ` (${fila.fraccion})` : ''}
                  </td>
                  {fila.celdas.map((obligacion, i) => {
                    const quincena = data.quincenas[i];
                    const estado = estadoCelda(obligacion, quincena.fecha_limite_pago, hoy);
                    return (
                      <td key={quincena.id} className={`p-1 text-center ${quincena.id === quincenaActualId ? 'bg-accent/5' : ''}`}>
                        <button
                          disabled={!obligacion || estado === 'pagada' || busyId === obligacion?.id}
                          onClick={() => obligacion && setConfirmPago(obligacion)}
                          aria-label={
                            obligacion
                              ? `${fila.participante}, quincena del ${fechaCorta(quincena.fecha_programada)}: ${ETIQUETA_ESTADO[estado]}, ${money(obligacion.saldo_pendiente)}`
                              : 'Sin obligación'
                          }
                          title={obligacion ? `${ETIQUETA_ESTADO[estado]} — esperado ${money(obligacion.valor_esperado)}` : 'Sin obligación'}
                          className={`h-8 w-16 rounded-md text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-default ${ESTILO_CELDA[estado]}`}
                        >
                          {estado === 'pagada' ? '✓' : obligacion ? money(obligacion.saldo_pendiente) : '—'}
                        </button>
                      </td>
                    );
                  })}
                  <td className="p-1 text-center">
                    {fila.entrega && (
                      <button
                        disabled={fila.entrega.estado === 'ENTREGADA' || busyId === fila.entrega.id}
                        onClick={() => fila.entrega && setConfirmEntrega(fila.entrega)}
                        aria-label={`Entrega de ${fila.participante}: ${fila.entrega.estado === 'ENTREGADA' ? 'ya entregada' : `pendiente, ${money(fila.entrega.valor_esperado)}`}`}
                        title={`${fila.entrega.estado} — esperado ${money(fila.entrega.valor_esperado)}`}
                        className={`h-8 w-24 rounded-md text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-default ${
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
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-surface-2 font-semibold text-text">
              <td className="sticky left-0 z-10 bg-surface-2 px-3 py-2">Total recaudado</td>
              <td className="px-3 py-2"></td>
              {totalesPorQuincena.map((t, i) => (
                <td key={data.quincenas[i].id} className="px-2 py-2 text-center text-xs">
                  {money(t)}
                </td>
              ))}
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <ConfirmPopover
        open={!!confirmPago}
        title="Confirmar pago"
        description={confirmPago ? `Marcar como pagado el total de ${money(confirmPago.saldo_pendiente)} de ${confirmPago.participante}.` : undefined}
        confirmLabel="Marcar pagado"
        onConfirm={confirmarPago}
        onCancel={() => setConfirmPago(null)}
      />
      <ConfirmPopover
        open={!!confirmEntrega}
        title="Confirmar entrega"
        description={
          confirmEntrega
            ? `Marcar como entregado el total de ${money(confirmEntrega.valor_esperado - confirmEntrega.valor_entregado)} a ${confirmEntrega.participante}.`
            : undefined
        }
        confirmLabel="Marcar entregado"
        onConfirm={confirmarEntrega}
        onCancel={() => setConfirmEntrega(null)}
      />
    </div>
  );
}
