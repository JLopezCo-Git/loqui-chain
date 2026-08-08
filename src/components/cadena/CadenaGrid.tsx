import { useEffect, useState, useCallback, useMemo } from 'react';
import { CheckCheck, Download, ChevronDown, ChevronUp, Undo2 } from 'lucide-react';
import { api } from '../../utils/api';
import { money } from '../../utils/money';
import { Button } from '../ui/Button';
import { Input, Label, Select } from '../ui/Field';
import { ConfirmPopover } from '../ui/ConfirmPopover';
import { METODOS_PAGO } from '../../constants/metodosPago';
import type { GrillaCadena, Obligacion, Entrega, GrillaFila } from '../../types';

type Quincena = GrillaCadena['quincenas'][number];

function fechaCorta(iso: string) {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
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

function exportarCSV(cadenaId: number, quincenas: Quincena[], quincenaIndices: number[], filas: GrillaFila[]) {
  const header = ['Participante', 'Puesto', ...quincenas.map((q) => q.fecha_programada), 'Entrega'];
  const rows = filas.map((f) => [
    f.participante,
    String(f.numero_puesto),
    ...quincenaIndices.map((i) => (f.celdas[i] ? String(f.celdas[i]!.valor_pagado) : '')),
    f.entrega ? String(f.entrega.valor_entregado) : '',
  ]);
  const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cadena-${cadenaId}-grilla.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function CadenaGrid({ cadenaId }: { cadenaId: number }) {
  const [data, setData] = useState<GrillaCadena | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [confirmPago, setConfirmPago] = useState<Obligacion | null>(null);
  const [montoPago, setMontoPago] = useState('');
  const [metodoPago, setMetodoPago] = useState<string>(METODOS_PAGO[0]);
  const [fechaPago, setFechaPago] = useState(hoyISO());
  const [confirmEntrega, setConfirmEntrega] = useState<Entrega | null>(null);
  const [confirmQuincena, setConfirmQuincena] = useState<Quincena | null>(null);
  const [cerrandoQuincena, setCerrandoQuincena] = useState(false);
  const [buscar, setBuscar] = useState('');
  const [vista, setVista] = useState<'fecha' | 'participante'>('fecha');
  const [soloPendientes, setSoloPendientes] = useState(false);
  const [ocultarCompletas, setOcultarCompletas] = useState(true);
  const [rango, setRango] = useState<[number, number] | null>(null);
  const [expandido, setExpandido] = useState<number | null>(null);
  const [confirmDeshacer, setConfirmDeshacer] = useState<Obligacion | null>(null);
  const [deshaciendo, setDeshaciendo] = useState(false);

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

  const hoy = hoyISO();

  const quincenaActualId = useMemo(() => {
    if (!data) return null;
    const proxima = data.quincenas.find((q) => q.fecha_limite_pago >= hoy);
    return proxima ? proxima.id : data.quincenas.at(-1)?.id ?? null;
  }, [data, hoy]);

  function abrirConfirmPago(obligacion: Obligacion) {
    setConfirmPago(obligacion);
    setMontoPago(String(obligacion.saldo_pendiente));
    setMetodoPago(METODOS_PAGO[0]);
    setFechaPago(hoy);
  }

  const montoPagoValido = confirmPago != null && Number(montoPago) > 0 && Number(montoPago) <= confirmPago.saldo_pendiente;

  async function confirmarPago() {
    if (!confirmPago || !data || !montoPagoValido) return;
    const obligacion = confirmPago;
    const monto = Number(montoPago);
    setBusyId(obligacion.id);
    // Actualización optimista: refleja el pago antes de que vuelva la red.
    setData({
      ...data,
      filas: data.filas.map((f) => ({
        ...f,
        celdas: f.celdas.map((c) => {
          if (c?.id !== obligacion.id) return c;
          const valor_pagado = c.valor_pagado + monto;
          const saldo_pendiente = Math.max(c.valor_esperado - valor_pagado, 0);
          return { ...c, valor_pagado, saldo_pendiente, estado: saldo_pendiente === 0 ? 'PAGADA' : 'PARCIAL' };
        }),
      })),
    });
    setConfirmPago(null);
    try {
      await api.post('/pagos', { obligacion_id: obligacion.id, valor_pago: monto, metodo_pago: metodoPago, fecha_pago: fechaPago });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar pago');
      await load(); // revertir el optimismo si falló
    } finally {
      setBusyId(null);
    }
  }

  async function deshacerPago() {
    if (!confirmDeshacer) return;
    const obligacion = confirmDeshacer;
    setDeshaciendo(true);
    try {
      await api.post(`/pagos/${obligacion.id}/deshacer`);
      setConfirmDeshacer(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al deshacer el pago');
    } finally {
      setDeshaciendo(false);
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

  async function cerrarQuincena() {
    if (!confirmQuincena) return;
    const quincena = confirmQuincena;
    setCerrandoQuincena(true);
    try {
      await api.post(`/cadenas/${cadenaId}/quincenas/${quincena.id}/cerrar`);
      setConfirmQuincena(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cerrar la quincena');
    } finally {
      setCerrandoQuincena(false);
    }
  }

  if (error) return <p className="text-sm text-error">{error}</p>;
  if (!data) return <p className="text-text-muted">Cargando grilla...</p>;

  const desde = rango ? rango[0] : 0;
  const hasta = rango ? rango[1] : data.quincenas.length - 1;

  function quincenaTienePendiente(i: number) {
    return data!.filas.some((f) => {
      const est = estadoCelda(f.celdas[i], data!.quincenas[i].fecha_limite_pago, hoy);
      return est === 'parcial' || est === 'proxima' || est === 'vencida';
    });
  }

  const indicesEnRango = data.quincenas.map((_, i) => i).filter((i) => i >= desde && i <= hasta);
  const indicesVisibles = ocultarCompletas ? indicesEnRango.filter(quincenaTienePendiente) : indicesEnRango;
  const quincenasVisibles = indicesVisibles.map((i) => data.quincenas[i]);

  const filasBusqueda = data.filas.filter((f) => f.participante.toLowerCase().includes(buscar.toLowerCase()));

  function tienePendiente(fila: GrillaFila) {
    return indicesVisibles.some((i) => {
      const est = estadoCelda(fila.celdas[i], data!.quincenas[i].fecha_limite_pago, hoy);
      return est === 'parcial' || est === 'proxima' || est === 'vencida';
    });
  }

  const filasMostradas = soloPendientes ? filasBusqueda.filter(tienePendiente) : filasBusqueda;

  const totalesPorQuincena = indicesVisibles.map((i) => filasMostradas.reduce((s, f) => s + (f.celdas[i]?.valor_pagado || 0), 0));
  const fraccionPorQuincena = indicesVisibles.map((i) => {
    const pagadas = filasMostradas.filter((f) => f.celdas[i]?.estado === 'PAGADA').length;
    return `${pagadas}/${filasMostradas.length}`;
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-text-muted">
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

      <div className="flex flex-wrap items-end gap-2">
        <input
          type="search"
          placeholder="Buscar participante..."
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          className="w-44 rounded-md border border-border bg-surface-2 px-3 py-1.5 text-sm text-text placeholder:text-text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />

        <div className="flex items-center gap-1 rounded-md border border-border bg-surface-2 p-0.5">
          <button
            onClick={() => setVista('fecha')}
            className={`rounded px-3 py-1 text-xs font-semibold transition-colors ${vista === 'fecha' ? 'bg-accent text-accent-ink' : 'text-text-muted hover:text-text'}`}
          >
            Por fecha
          </button>
          <button
            onClick={() => setVista('participante')}
            className={`rounded px-3 py-1 text-xs font-semibold transition-colors ${vista === 'participante' ? 'bg-accent text-accent-ink' : 'text-text-muted hover:text-text'}`}
          >
            Por participante
          </button>
        </div>

        <label className="flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-xs text-text-muted">
          <input type="checkbox" checked={soloPendientes} onChange={(e) => setSoloPendientes(e.target.checked)} />
          Solo participantes con pendientes
        </label>
        <label className="flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-xs text-text-muted">
          <input type="checkbox" checked={ocultarCompletas} onChange={(e) => setOcultarCompletas(e.target.checked)} />
          Solo quincenas con pendientes
        </label>

        <div className="flex items-center gap-1 text-xs text-text-muted">
          <span>Desde</span>
          <Select
            className="w-auto py-1.5 text-xs"
            value={desde}
            onChange={(e) => setRango([Number(e.target.value), Math.max(hasta, Number(e.target.value))])}
          >
            {data.quincenas.map((q, i) => (
              <option key={q.id} value={i}>
                {fechaCorta(q.fecha_programada)}
              </option>
            ))}
          </Select>
          <span>hasta</span>
          <Select
            className="w-auto py-1.5 text-xs"
            value={hasta}
            onChange={(e) => setRango([Math.min(desde, Number(e.target.value)), Number(e.target.value)])}
          >
            {data.quincenas.map((q, i) => (
              <option key={q.id} value={i}>
                {fechaCorta(q.fecha_programada)}
              </option>
            ))}
          </Select>
          {rango && (
            <Button variant="ghost" onClick={() => setRango(null)} className="px-2 py-1 text-xs">
              Ver todas
            </Button>
          )}
        </div>

        <Button variant="ghost" onClick={() => exportarCSV(cadenaId, quincenasVisibles, indicesVisibles, filasMostradas)} className="ml-auto">
          <Download size={14} /> Exportar CSV
        </Button>
      </div>

      {indicesVisibles.length === 0 ? (
        <p className="rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
          No hay quincenas con pendientes en el rango seleccionado — todo al día.
        </p>
      ) : vista === 'fecha' ? (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="text-left text-sm">
            <thead className="bg-surface-2 text-text-muted">
              <tr>
                <th className="sticky left-0 z-10 bg-surface-2 px-3 py-2 font-medium">Participante</th>
                <th className="px-3 py-2 font-medium">Puesto</th>
                {quincenasVisibles.map((q) => (
                  <th
                    key={q.id}
                    className={`whitespace-nowrap px-2 py-2 text-center font-medium ${q.id === quincenaActualId ? 'bg-accent/15 text-accent' : ''}`}
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      <span>
                        {fechaCorta(q.fecha_programada)}
                        {q.id === quincenaActualId && <span className="block text-[10px] font-normal">actual</span>}
                      </span>
                      {q.estado === 'CERRADA' ? (
                        <span title="Quincena cerrada: todos pagaron y se entregó" className="text-success">
                          <CheckCheck size={14} aria-hidden="true" />
                        </span>
                      ) : (
                        <Button
                          variant="icon"
                          onClick={() => setConfirmQuincena(q)}
                          aria-label={`Cerrar quincena del ${fechaCorta(q.fecha_programada)}: marcar que todos pagaron y se entregó`}
                          title="Todos pagaron y se entregó"
                        >
                          <CheckCheck size={14} />
                        </Button>
                      )}
                    </div>
                  </th>
                ))}
                <th className="whitespace-nowrap px-3 py-2 font-medium">Entrega</th>
              </tr>
            </thead>
            <tbody>
              {filasMostradas.map((fila) => {
                const totalPagado = fila.celdas.reduce((s, c) => s + (c?.valor_pagado || 0), 0);
                const totalEsperado = fila.celdas.reduce((s, c) => s + (c?.valor_esperado || 0), 0);
                const progreso = totalEsperado ? Math.round((totalPagado / totalEsperado) * 100) : 0;
                return (
                  <tr key={fila.puesto_id} className="border-t border-border">
                    <td className="sticky left-0 z-10 bg-surface px-3 py-2 font-medium text-text">
                      <div className="flex items-center justify-between gap-2">
                        <span>{fila.participante}</span>
                        <span className="text-xs font-normal text-text-faint">{progreso}%</span>
                      </div>
                      <div className="mt-1 h-1.5 w-28 overflow-hidden rounded-full bg-surface-3">
                        <div className="h-full rounded-full bg-success" style={{ width: `${progreso}%` }} />
                      </div>
                    </td>
                    <td className="px-3 py-2 text-text-muted">
                      {fila.numero_puesto}
                      {fila.fraccion < 1 ? ` (${fila.fraccion})` : ''}
                    </td>
                    {indicesVisibles.map((i) => {
                      const obligacion = fila.celdas[i];
                      const quincena = data.quincenas[i];
                      const estado = estadoCelda(obligacion, quincena.fecha_limite_pago, hoy);
                      return (
                        <td key={quincena.id} className={`p-1 text-center ${quincena.id === quincenaActualId ? 'bg-accent/5' : ''}`}>
                          <div className="relative inline-block">
                            <button
                              disabled={!obligacion || estado === 'pagada' || busyId === obligacion?.id}
                              onClick={() => obligacion && abrirConfirmPago(obligacion)}
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
                            {obligacion && obligacion.valor_pagado > 0 && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmDeshacer(obligacion);
                                }}
                                aria-label={`Deshacer el último pago de ${fila.participante} en esta quincena`}
                                title="Deshacer último pago"
                                className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-surface-3 text-text-faint ring-1 ring-border hover:bg-error/20 hover:text-error focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                              >
                                <Undo2 size={9} />
                              </button>
                            )}
                          </div>
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
              {!filasMostradas.length && (
                <tr>
                  <td colSpan={quincenasVisibles.length + 3} className="px-3 py-4 text-center text-text-faint">
                    Sin resultados.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-surface-2 font-semibold text-text">
                <td className="sticky left-0 z-10 bg-surface-2 px-3 py-2">Total recaudado</td>
                <td className="px-3 py-2"></td>
                {totalesPorQuincena.map((t, idx) => (
                  <td key={quincenasVisibles[idx].id} className="px-2 py-2 text-center text-xs">
                    <div>{money(t)}</div>
                    <div className="font-normal text-text-faint">{fraccionPorQuincena[idx]}</div>
                  </td>
                ))}
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filasMostradas.map((fila) => {
            const totalPagado = fila.celdas.reduce((s, c) => s + (c?.valor_pagado || 0), 0);
            const totalEsperado = fila.celdas.reduce((s, c) => s + (c?.valor_esperado || 0), 0);
            const progreso = totalEsperado ? Math.round((totalPagado / totalEsperado) * 100) : 0;
            const abierto = expandido === fila.puesto_id;
            return (
              <div key={fila.puesto_id} className="rounded-lg border border-border bg-surface">
                <button
                  onClick={() => setExpandido(abierto ? null : fila.puesto_id)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                >
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-text">
                        {fila.participante} <span className="text-text-faint">· puesto {fila.numero_puesto}</span>
                      </span>
                      <span className="text-xs text-text-muted">{progreso}%</span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
                      <div className="h-full rounded-full bg-success" style={{ width: `${progreso}%` }} />
                    </div>
                  </div>
                  {abierto ? <ChevronUp size={16} className="text-text-muted" /> : <ChevronDown size={16} className="text-text-muted" />}
                </button>
                {abierto && (
                  <div className="flex flex-wrap gap-1.5 border-t border-border p-3">
                    {indicesVisibles.map((i) => {
                      const obligacion = fila.celdas[i];
                      const quincena = data.quincenas[i];
                      const estado = estadoCelda(obligacion, quincena.fecha_limite_pago, hoy);
                      return (
                        <div key={quincena.id} className="relative inline-block">
                          <button
                            disabled={!obligacion || estado === 'pagada' || busyId === obligacion?.id}
                            onClick={() => obligacion && abrirConfirmPago(obligacion)}
                            title={`${fechaCorta(quincena.fecha_programada)} — ${ETIQUETA_ESTADO[estado]}`}
                            className={`flex h-10 w-16 flex-col items-center justify-center rounded-md text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-default ${ESTILO_CELDA[estado]}`}
                          >
                            <span>{fechaCorta(quincena.fecha_programada)}</span>
                            <span>{estado === 'pagada' ? '✓' : obligacion ? money(obligacion.saldo_pendiente) : '—'}</span>
                          </button>
                          {obligacion && obligacion.valor_pagado > 0 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDeshacer(obligacion);
                              }}
                              aria-label={`Deshacer el último pago de ${fila.participante} en esta quincena`}
                              title="Deshacer último pago"
                              className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-surface-3 text-text-faint ring-1 ring-border hover:bg-error/20 hover:text-error focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                            >
                              <Undo2 size={9} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {!filasMostradas.length && <p className="py-4 text-center text-sm text-text-faint">Sin resultados.</p>}
        </div>
      )}

      <ConfirmPopover
        open={!!confirmPago}
        title="Registrar pago"
        description={confirmPago ? `${confirmPago.participante} — saldo pendiente: ${money(confirmPago.saldo_pendiente)}.` : undefined}
        confirmLabel={
          confirmPago && Number(montoPago) > 0 && Number(montoPago) < confirmPago.saldo_pendiente ? 'Registrar pago parcial' : 'Marcar pagado'
        }
        confirmDisabled={!montoPagoValido}
        onConfirm={confirmarPago}
        onCancel={() => setConfirmPago(null)}
      >
        <div className="flex flex-col gap-2">
          <div>
            <Label>Monto</Label>
            <Input type="number" min={1} max={confirmPago?.saldo_pendiente} value={montoPago} onChange={(e) => setMontoPago(e.target.value)} autoFocus />
            {confirmPago && !montoPagoValido && montoPago !== '' && (
              <p className="mt-1 text-xs text-error">El monto debe ser mayor a 0 y no puede superar el saldo pendiente.</p>
            )}
          </div>
          <div>
            <Label>Fecha de pago</Label>
            <Input type="date" value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} />
          </div>
          <div>
            <Label>Método de pago</Label>
            <Select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)}>
              {METODOS_PAGO.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </ConfirmPopover>
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
      <ConfirmPopover
        open={!!confirmQuincena}
        title="Cerrar quincena"
        description={
          confirmQuincena
            ? `Se marcará como pagado el saldo pendiente de TODOS los participantes de la quincena del ${fechaCorta(confirmQuincena.fecha_programada)}, y como entregado lo programado para ese ciclo. No se puede deshacer.`
            : undefined
        }
        confirmLabel="Sí, todos pagaron y se entregó"
        loading={cerrandoQuincena}
        onConfirm={cerrarQuincena}
        onCancel={() => setConfirmQuincena(null)}
      />
      <ConfirmPopover
        open={!!confirmDeshacer}
        title="Deshacer pago"
        description={
          confirmDeshacer
            ? `Se deshará el último pago registrado de ${confirmDeshacer.participante} en esta quincena. Si ese dinero ya se usó en una entrega, no se podrá deshacer.`
            : undefined
        }
        confirmLabel="Sí, deshacer"
        danger
        loading={deshaciendo}
        onConfirm={deshacerPago}
        onCancel={() => setConfirmDeshacer(null)}
      />
    </div>
  );
}
