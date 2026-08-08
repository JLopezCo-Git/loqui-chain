import { useEffect, useState, useCallback, useMemo } from 'react';
import { ChevronLeft, ChevronRight, CheckCheck } from 'lucide-react';
import { api } from '../../utils/api';
import { money } from '../../utils/money';
import { Button } from '../ui/Button';
import { Input, Label, Select } from '../ui/Field';
import { ConfirmPopover } from '../ui/ConfirmPopover';
import { METODOS_PAGO } from '../../constants/metodosPago';
import type { GrillaCadena, Obligacion } from '../../types';

// Vista para móvil: en vez de comprimir la matriz completa, se navega
// quincena por quincena -- responde directo "¿quién debe pagar en este
// ciclo?" sin scroll horizontal.
export function AgendaQuincena({ cadenaId }: { cadenaId: number }) {
  const [data, setData] = useState<GrillaCadena | null>(null);
  const [indice, setIndice] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [confirmPago, setConfirmPago] = useState<Obligacion | null>(null);
  const [montoPago, setMontoPago] = useState('');
  const [metodoPago, setMetodoPago] = useState<string>(METODOS_PAGO[0]);
  const [fechaPago, setFechaPago] = useState(new Date().toISOString().slice(0, 10));
  const [confirmCerrar, setConfirmCerrar] = useState(false);
  const [cerrando, setCerrando] = useState(false);

  const load = useCallback(async () => {
    try {
      const grilla = await api.get<GrillaCadena>(`/reportes/cadena/${cadenaId}/grilla`);
      setData(grilla);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar la agenda');
    }
  }, [cadenaId]);

  useEffect(() => {
    load();
  }, [load]);

  const hoy = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!data || indice !== null) return;
    const i = data.quincenas.findIndex((q) => q.fecha_limite_pago >= hoy);
    setIndice(i >= 0 ? i : Math.max(data.quincenas.length - 1, 0));
  }, [data, indice, hoy]);

  const quincena = useMemo(() => (data && indice !== null ? data.quincenas[indice] : null), [data, indice]);

  const filasQuincena = useMemo(() => {
    if (!data || indice === null) return [];
    return data.filas
      .map((f) => ({ fila: f, obligacion: f.celdas[indice] }))
      .filter((r) => r.obligacion);
  }, [data, indice]);

  const entregaQuincena = useMemo(() => {
    if (!data || !quincena) return null;
    return data.filas.find((f) => f.entrega?.quincena_id === quincena.id)?.entrega || null;
  }, [data, quincena]);

  function abrirConfirmPago(obligacion: Obligacion) {
    setConfirmPago(obligacion);
    setMontoPago(String(obligacion.saldo_pendiente));
    setMetodoPago(METODOS_PAGO[0]);
    setFechaPago(hoy);
  }

  const montoPagoValido = confirmPago != null && Number(montoPago) > 0 && Number(montoPago) <= confirmPago.saldo_pendiente;

  async function confirmarPago() {
    if (!confirmPago || !montoPagoValido) return;
    const obligacion = confirmPago;
    const monto = Number(montoPago);
    setBusyId(obligacion.id);
    setConfirmPago(null);
    try {
      await api.post('/pagos', { obligacion_id: obligacion.id, valor_pago: monto, metodo_pago: metodoPago, fecha_pago: fechaPago });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar pago');
    } finally {
      setBusyId(null);
    }
  }

  async function cerrarQuincena() {
    if (!quincena) return;
    setCerrando(true);
    try {
      await api.post(`/cadenas/${cadenaId}/quincenas/${quincena.id}/cerrar`);
      setConfirmCerrar(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cerrar la quincena');
    } finally {
      setCerrando(false);
    }
  }

  if (error) return <p className="text-sm text-error">{error}</p>;
  if (!data || !quincena) return <p className="text-text-muted">Cargando agenda...</p>;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Button
          variant="icon"
          aria-label="Quincena anterior"
          disabled={indice === 0}
          onClick={() => setIndice((i) => Math.max((i ?? 0) - 1, 0))}
        >
          <ChevronLeft size={16} />
        </Button>
        <div className="text-center">
          <span className="block text-sm font-semibold text-text">Quincena {quincena.numero_quincena}</span>
          <span className="block text-xs text-text-muted">Vence {quincena.fecha_limite_pago}</span>
        </div>
        <Button
          variant="icon"
          aria-label="Quincena siguiente"
          disabled={indice === data.quincenas.length - 1}
          onClick={() => setIndice((i) => Math.min((i ?? 0) + 1, data.quincenas.length - 1))}
        >
          <ChevronRight size={16} />
        </Button>
      </div>

      {quincena.estado === 'CERRADA' ? (
        <div className="flex items-center justify-center gap-2 rounded-md bg-success/10 px-3 py-2 text-sm text-success">
          <CheckCheck size={16} aria-hidden="true" /> Quincena cerrada: todos pagaron y se entregó
        </div>
      ) : (
        <Button variant="ghost" onClick={() => setConfirmCerrar(true)} className="justify-center">
          <CheckCheck size={16} />
          Todos pagaron y se entregó
        </Button>
      )}

      {entregaQuincena && (
        <div className="rounded-md bg-violet-role/10 px-3 py-2 text-sm text-violet-role">
          Entrega este ciclo: {money(entregaQuincena.valor_esperado)} {entregaQuincena.estado === 'ENTREGADA' ? '(ya entregada)' : '(pendiente)'}
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {filasQuincena.map(({ fila, obligacion }) => {
          if (!obligacion) return null;
          const vencida = obligacion.estado !== 'PAGADA' && quincena.fecha_limite_pago < hoy;
          const pagada = obligacion.estado === 'PAGADA';
          return (
            <li
              key={fila.puesto_id}
              className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2.5 ${
                pagada ? 'border-success/30 bg-success/10' : vencida ? 'border-error/30 bg-error/10' : 'border-border bg-surface-2'
              }`}
            >
              <div>
                <span className="block text-sm font-medium text-text">{fila.participante}</span>
                <span className="block text-xs text-text-muted">
                  {pagada ? 'Pagado' : vencida ? 'Vencida' : 'Pendiente'} · {money(obligacion.saldo_pendiente)}
                </span>
              </div>
              {!pagada && (
                <Button variant={vencida ? 'danger' : 'ghost'} loading={busyId === obligacion.id} onClick={() => abrirConfirmPago(obligacion)}>
                  Marcar pagado
                </Button>
              )}
            </li>
          );
        })}
      </ul>

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
            <Input
              type="number"
              min={1}
              max={confirmPago?.saldo_pendiente}
              value={montoPago}
              onChange={(e) => setMontoPago(e.target.value)}
              autoFocus
            />
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
        open={confirmCerrar}
        title="Cerrar quincena"
        description={`Se marcará como pagado el saldo pendiente de TODOS en la quincena ${quincena.numero_quincena}, y como entregado lo programado para este ciclo. No se puede deshacer.`}
        confirmLabel="Sí, todos pagaron y se entregó"
        loading={cerrando}
        onConfirm={cerrarQuincena}
        onCancel={() => setConfirmCerrar(false)}
      />
    </div>
  );
}
