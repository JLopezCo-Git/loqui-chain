import { useEffect, useState, useCallback } from 'react';
import { AlertTriangle, PackageCheck, Wallet } from 'lucide-react';
import { api } from '../../utils/api';
import { money } from '../../utils/money';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { ConfirmPopover } from '../ui/ConfirmPopover';
import type { Atencion, Obligacion } from '../../types';

function diasVencida(fechaLimite: string) {
  const dias = Math.floor((Date.now() - new Date(`${fechaLimite}T00:00:00`).getTime()) / 86400000);
  return dias > 0 ? dias : 0;
}

export function AtencionRequerida({ cadenaId, onAction }: { cadenaId: number; onAction: () => void }) {
  const [data, setData] = useState<Atencion | null>(null);
  const [confirmando, setConfirmando] = useState<{ tipo: 'pago'; obligacion: Obligacion } | { tipo: 'entrega' } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setData(await api.get<Atencion>(`/reportes/cadena/${cadenaId}/atencion`));
  }, [cadenaId]);

  useEffect(() => {
    load();
  }, [load]);

  async function confirmarPago(obligacion: Obligacion) {
    setBusy(true);
    try {
      await api.post('/pagos', { obligacion_id: obligacion.id, valor_pago: obligacion.saldo_pendiente, metodo_pago: 'Efectivo' });
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
        <Button variant="danger" onClick={() => setConfirmando({ tipo: 'pago', obligacion: o })}>
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
        title="Confirmar pago"
        description={
          confirmando?.tipo === 'pago'
            ? `Marcar como pagado el total de ${money(confirmando.obligacion.saldo_pendiente)} de ${confirmando.obligacion.participante}.`
            : undefined
        }
        confirmLabel="Marcar pagado"
        loading={busy}
        onConfirm={() => confirmando?.tipo === 'pago' && confirmarPago(confirmando.obligacion)}
        onCancel={() => setConfirmando(null)}
      />
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
