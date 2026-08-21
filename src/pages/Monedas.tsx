import { useEffect, useState, useCallback } from 'react';
import { api } from '../utils/api';
import { money } from '../utils/money';
import { Card } from '../components/ui/Card';
import { Input, Label } from '../components/ui/Field';
import { Button } from '../components/ui/Button';
import { Banner } from '../components/ui/Banner';
import type { ConteoMonedas } from '../types';

const MONEDAS_DEFAULT = [
  { valor: 50, porGrupo: 10 },
  { valor: 100, porGrupo: 100 },
  { valor: 200, porGrupo: 50 },
  { valor: 500, porGrupo: 20 },
  { valor: 1000, porGrupo: 10 },
];
const BILLETES_VALORES = [2000, 5000, 10000, 20000, 50000, 100000];

export function Monedas() {
  const [monedas, setMonedas] = useState(MONEDAS_DEFAULT.map((m) => ({ ...m, porGrupo: String(m.porGrupo), grupos: '' })));
  const [billetes, setBilletes] = useState(BILLETES_VALORES.map((valor) => ({ valor, cantidad: '' })));
  const [observaciones, setObservaciones] = useState('');
  const [historial, setHistorial] = useState<ConteoMonedas[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setHistorial(await api.get<ConteoMonedas[]>('/monedas'));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function actualizarMoneda(i: number, campo: 'porGrupo' | 'grupos', valor: string) {
    const copia = [...monedas];
    copia[i] = { ...copia[i], [campo]: valor };
    setMonedas(copia);
  }

  function actualizarBillete(i: number, cantidad: string) {
    const copia = [...billetes];
    copia[i] = { ...copia[i], cantidad };
    setBilletes(copia);
  }

  const monedasCalc = monedas.map((m) => {
    const porGrupo = Number(m.porGrupo) || 0;
    const grupos = Number(m.grupos) || 0;
    const monedasTotales = porGrupo * grupos;
    return { valor: m.valor, porGrupo, grupos, monedasTotales, valorPorGrupo: m.valor * porGrupo, subtotal: m.valor * monedasTotales };
  });
  const billetesCalc = billetes.map((b) => ({ valor: b.valor, cantidad: Number(b.cantidad) || 0, subtotal: b.valor * (Number(b.cantidad) || 0) }));
  const totalMonedas = monedasCalc.reduce((s, m) => s + m.subtotal, 0);
  const totalBilletes = billetesCalc.reduce((s, b) => s + b.subtotal, 0);
  const totalGeneral = totalMonedas + totalBilletes;

  async function guardar() {
    setError('');
    setGuardando(true);
    try {
      await api.post('/monedas', {
        monedas: monedasCalc.map(({ valor, porGrupo, grupos }) => ({ valor, porGrupo, grupos })),
        billetes: billetesCalc.map(({ valor, cantidad }) => ({ valor, cantidad })),
        observaciones: observaciones || null,
      });
      setMonedas(MONEDAS_DEFAULT.map((m) => ({ ...m, porGrupo: String(m.porGrupo), grupos: '' })));
      setBilletes(BILLETES_VALORES.map((valor) => ({ valor, cantidad: '' })));
      setObservaciones('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar el conteo');
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar(id: number) {
    setError('');
    try {
      await api.delete(`/monedas/${id}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar el conteo');
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="font-display text-2xl font-bold text-text">Conteo de alcancía</h2>
      {error && <Banner kind="error">{error}</Banner>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-surface-2 p-3">
          <span className="block text-xs text-text-muted">Total monedas</span>
          <b className="text-lg text-text">{money(totalMonedas)}</b>
        </div>
        <div className="rounded-lg bg-surface-2 p-3">
          <span className="block text-xs text-text-muted">Total billetes</span>
          <b className="text-lg text-text">{money(totalBilletes)}</b>
        </div>
        <div className="rounded-lg bg-accent/10 p-3">
          <span className="block text-xs text-text-muted">Total general</span>
          <b className="text-lg text-accent">{money(totalGeneral)}</b>
        </div>
      </div>

      <Card>
        <h3 className="mb-1 text-sm font-semibold text-text">Monedas agrupadas</h3>
        <p className="mb-3 text-xs text-text-faint">
          "Monedas por grupo" es cuántas monedas trae cada rollo/bolsa que ya tienes armado; "Cantidad de grupos" es cuántos rollos de esos
          contaste.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-text-muted">
              <tr>
                <th className="px-2 py-1 font-medium">Denominación</th>
                <th className="px-2 py-1 font-medium">Monedas por grupo</th>
                <th className="px-2 py-1 font-medium">Cantidad de grupos</th>
                <th className="px-2 py-1 font-medium">Monedas totales</th>
                <th className="px-2 py-1 font-medium">Valor por grupo</th>
                <th className="px-2 py-1 font-medium">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {monedas.map((m, i) => (
                <tr key={m.valor} className="border-t border-border">
                  <td className="px-2 py-1.5 text-text">{money(m.valor)}</td>
                  <td className="px-2 py-1.5">
                    <Input type="number" min={0} className="w-24" value={m.porGrupo} onChange={(e) => actualizarMoneda(i, 'porGrupo', e.target.value)} />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input type="number" min={0} className="w-24" value={m.grupos} onChange={(e) => actualizarMoneda(i, 'grupos', e.target.value)} />
                  </td>
                  <td className="px-2 py-1.5 text-text-muted">{monedasCalc[i].monedasTotales}</td>
                  <td className="px-2 py-1.5 text-text-muted">{money(monedasCalc[i].valorPorGrupo)}</td>
                  <td className="px-2 py-1.5 font-medium text-text">{money(monedasCalc[i].subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-semibold text-text">Billetes</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-text-muted">
              <tr>
                <th className="px-2 py-1 font-medium">Denominación</th>
                <th className="px-2 py-1 font-medium">Cantidad</th>
                <th className="px-2 py-1 font-medium">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {billetes.map((b, i) => (
                <tr key={b.valor} className="border-t border-border">
                  <td className="px-2 py-1.5 text-text">{money(b.valor)}</td>
                  <td className="px-2 py-1.5">
                    <Input type="number" min={0} className="w-24" value={b.cantidad} onChange={(e) => actualizarBillete(i, e.target.value)} />
                  </td>
                  <td className="px-2 py-1.5 font-medium text-text">{money(billetesCalc[i].subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <Label>Observaciones (opcional)</Label>
        <Input value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
        <Button onClick={guardar} loading={guardando} className="mt-3">
          Guardar conteo
        </Button>
      </Card>

      {historial.length > 0 && (
        <Card>
          <h3 className="mb-3 text-sm font-semibold text-text">Historial</h3>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-2 text-text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Fecha</th>
                  <th className="px-3 py-2 font-medium">Monedas</th>
                  <th className="px-3 py-2 font-medium">Billetes</th>
                  <th className="px-3 py-2 font-medium">Total</th>
                  <th className="px-3 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {historial.map((c) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="px-3 py-2 text-text-muted">{c.fecha}</td>
                    <td className="px-3 py-2 text-text">{money(c.total_monedas)}</td>
                    <td className="px-3 py-2 text-text">{money(c.total_billetes)}</td>
                    <td className="px-3 py-2 font-semibold text-text">{money(c.total_general)}</td>
                    <td className="px-3 py-2">
                      <Button variant="ghost" onClick={() => eliminar(c.id)}>
                        Eliminar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
