import { useEffect, useState, useCallback } from 'react';
import { AlertTriangle, PackageCheck, Wallet } from 'lucide-react';
import { api } from '../../utils/api';
import { money } from '../../utils/money';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input, Label, Select } from '../ui/Field';
import { ConfirmPopover } from '../ui/ConfirmPopover';
import { METODOS_PAGO } from '../../constants/metodosPago';
import type { Atencion, Obligacion } from '../../types';

function diasVencida(fechaLimite: string) {
  const dias = Math.floor((Date.now() - new Date(`${fechaLimite}T00:00:00`).getTime()) / 86400000);
  return dias > 0 ? dias : 0;
}

export function AtencionRequerida({ cadenaId, onAction }: { cadenaId: number; onAction: () => void }) {
  const [data, setData] = useState<Atencion | null>(null);
  const [confirmando, setConfirmando] = useState<{ tipo: 'pago'; obligacion: Obligacion } | { tipo: 'entrega' } | null>(null);
  const [montoPago, setMontoPago] = useState('');
  const [metodoPago, setMetodoPago] = useState<string>(METODOS_PAGO[0]);
  const [fechaPago, setFechaPago] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setData(await api.get<Atencion>(`/reportes/cadena/${cadenaId}/atencion`));
  }, [cadenaId]);

  useEffect(() => {
    load();
  }, [load]);

  const montoPagoValido =
    confirmando?.tipo === 'pago' && Number(montoPago) > 0 && Number(montoPago) <= confirmando.obligacion.saldo_pendiente;

  async function confirmarPago(obligacion: Obligacion) {
    if (!montoPagoValido) return;
    setBusy(true);
    try {
      await api.post('/pagos', { obligacion_id: obligacion.id, valor_pago: Number(montoPago), metodo_pago: metodoPago, fecha_pago: fechaPago });
      setConfirmando(null);
      await load();
      onAction();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar el pago');
    } finally {
      setBusy(false);
    }
  }

  async function confirmarEntrega() {
    if (!data?.proximaEntrega) return;
    setBusy(true);
    try {
      const e = data.proximaEntrega;
      await api.post('/entregas/registrar', { entrega_id: e.id, valor_entregado: e.valor_esperado - e.valor_entregado });
      setConfirmando(null);
      await load();
      onAction();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar la entrega');
    } finally {
      setBusy(false);
    }
  }

  if (!data) return null;

  const items = [
    ...data.vencidas.map((o) => ({
      key: `venc-${o.id}`,
      icon: AlertTriangle,
      tone: 'error' as const,
      texto: `${o.participante} — cuota vencida hace ${diasVencida(o.fecha_limite_pago || '')} día(s) — ${money(o.saldo_pendiente)}`,
      accion: (
        <Button
          variant="danger"
          onClick={() => {
            setConfirmando({ tipo: 'pago', obligacion: o });
            setMontoPago(String(o.saldo_pendiente));
            setMetodoPago(METODOS_PAGO[0]);
            setFechaPago(new Date().toISOString().slice(0, 10));
          }}
        >
          Marcar pagado
        </Button>
      ),
    })),
    ...(data.proximaEntrega
      ? [
          {
            key: 'entrega',
            icon: PackageCheck,
            tone: 'neutral' as const,
            texto: `Próxima entrega: ${data.proximaEntrega.participante} — ${money(data.proximaEntrega.valor_esperado)} — ${data.proximaEntrega.fecha_programada}`,
            accion: (
              <Button variant="ghost" onClick={() => setConfirmando({ tipo: 'entrega' })}>
                Marcar entregado
              </Button>
            ),
          },
        ]
      : []),
    ...(data.arqueoFaltante
      ? [
          {
            key: 'arqueo',
            icon: Wallet,
            tone: 'warning' as const,
            texto: `El último arqueo quedó con ${money(data.arqueoFaltante)} por reponer`,
            accion: (
              <a href="#arqueo">
                <Button variant="ghost">Ver arqueo</Button>
              </a>
            ),
          },
        ]
      : []),
  ];

  if (!items.length) {
    return (
      <Card>
        <p className="text-sm text-success">Sin pendientes urgentes — todo al día.</p>
      </Card>
    );
  }

  const toneClass = { error: 'text-error', warning: 'text-warning', neutral: 'text-text-muted' };

  return (
    <Card>
      <h3 className="mb-3 flex items-center gap-2 font-semibold text-text">
        <AlertTriangle size={18} className="text-warning" aria-hidden="true" />
        Atención requerida ({items.length})
      </h3>
      {error && <p className="mb-2 text-sm text-error">{error}</p>}
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.key} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-2 px-3 py-2">
            <span className={`flex items-center gap-2 text-sm ${toneClass[item.tone]}`}>
              <item.icon size={16} className="shrink-0" aria-hidden="true" />
              <span className="text-text">{item.texto}</span>
            </span>
            {item.accion}
          </li>
        ))}
      </ul>

      <ConfirmPopover
        open={confirmando?.tipo === 'pago'}
        title="Registrar pago"
        description={
          confirmando?.tipo === 'pago'
            ? `${confirmando.obligacion.participante} — saldo pendiente: ${money(confirmando.obligacion.saldo_pendiente)}.`
            : undefined
        }
        confirmLabel={
          confirmando?.tipo === 'pago' && Number(montoPago) > 0 && Number(montoPago) < confirmando.obligacion.saldo_pendiente
            ? 'Registrar pago parcial'
            : 'Marcar pagado'
        }
        confirmDisabled={!montoPagoValido}
        danger
        loading={busy}
        onConfirm={() => confirmando?.tipo === 'pago' && confirmarPago(confirmando.obligacion)}
        onCancel={() => setConfirmando(null)}
      >
        <div className="flex flex-col gap-2">
          <div>
            <Label>Monto</Label>
            <Input
              type="number"
              min={1}
              max={confirmando?.tipo === 'pago' ? confirmando.obligacion.saldo_pendiente : undefined}
              value={montoPago}
              onChange={(e) => setMontoPago(e.target.value)}
              autoFocus
            />
            {confirmando?.tipo === 'pago' && !montoPagoValido && montoPago !== '' && (
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
        open={confirmando?.tipo === 'entrega'}
        title="Confirmar entrega"
        description={
          data.proximaEntrega ? `Marcar como entregado el total de ${money(data.proximaEntrega.valor_esperado)} a ${data.proximaEntrega.participante}.` : undefined
        }
        confirmLabel="Marcar entregado"
        loading={busy}
        onConfirm={confirmarEntrega}
        onCancel={() => setConfirmando(null)}
      />
    </Card>
  );
}
