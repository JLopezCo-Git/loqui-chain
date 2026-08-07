import { useEffect, useState, useCallback } from 'react';
import { api } from '../../utils/api';
import { money } from '../../utils/money';
import { Card } from '../ui/Card';
import { Input, Label } from '../ui/Field';
import { Button } from '../ui/Button';
import { Banner } from '../ui/Banner';
import type { ArqueoCaja } from '../../types';

const DENOMINACIONES = [100000, 50000, 20000, 10000, 5000, 2000, 1000];

export function Arqueo({ cadenaId }: { cadenaId: number }) {
  const [esperado, setEsperado] = useState(0);
  const [cantidades, setCantidades] = useState<Record<number, string>>({});
  const [otrasFuentes, setOtrasFuentes] = useState<{ etiqueta: string; monto: string }[]>([]);
  const [observaciones, setObservaciones] = useState('');
  const [historial, setHistorial] = useState<ArqueoCaja[]>([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [e, h] = await Promise.all([
      api.get<{ esperado: number }>(`/arqueos/cadena/${cadenaId}/esperado`),
      api.get<ArqueoCaja[]>(`/arqueos/cadena/${cadenaId}`),
    ]);
    setEsperado(e.esperado);
    setHistorial(h);
  }, [cadenaId]);

  useEffect(() => {
    load();
  }, [load]);

  const efectivoContado = DENOMINACIONES.reduce((sum, v) => sum + v * Number(cantidades[v] || 0), 0);
  const totalOtrasFuentes = otrasFuentes.reduce((sum, i) => sum + Number(i.monto || 0), 0);
  const faltaReponer = esperado - efectivoContado - totalOtrasFuentes;

  function agregarFuente() {
    setOtrasFuentes([...otrasFuentes, { etiqueta: '', monto: '' }]);
  }

  function actualizarFuente(i: number, campo: 'etiqueta' | 'monto', valor: string) {
    const copia = [...otrasFuentes];
    copia[i] = { ...copia[i], [campo]: valor };
    setOtrasFuentes(copia);
  }

  function quitarFuente(i: number) {
    setOtrasFuentes(otrasFuentes.filter((_, idx) => idx !== i));
  }

  async function guardar() {
    setError('');
    try {
      await api.post('/arqueos', {
        cadena_id: cadenaId,
        efectivo_contado: efectivoContado,
        denominaciones: DENOMINACIONES.map((valor) => ({ valor, cantidad: Number(cantidades[valor] || 0) })),
        observaciones: observaciones || null,
        items: otrasFuentes.filter((f) => f.etiqueta.trim()).map((f) => ({ etiqueta: f.etiqueta.trim(), monto: Number(f.monto || 0) })),
      });
      setCantidades({});
      setOtrasFuentes([]);
      setObservaciones('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar el arqueo');
    }
  }

  async function eliminarArqueo(id: number) {
    setError('');
    try {
      await api.delete(`/arqueos/${id}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar el arqueo');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <Banner kind="error">{error}</Banner>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <h4 className="mb-3 text-sm font-semibold text-text">Efectivo contado</h4>
          <div className="flex flex-col gap-2">
            {DENOMINACIONES.map((v) => (
              <div key={v} className="flex items-center gap-2">
                <span className="w-24 text-sm text-text-muted">{money(v)}</span>
                <Input
                  type="number"
                  min={0}
                  placeholder="cantidad"
                  className="w-24"
                  value={cantidades[v] ?? ''}
                  onChange={(e) => setCantidades({ ...cantidades, [v]: e.target.value })}
                />
                <span className="text-sm text-text-faint">= {money(v * Number(cantidades[v] || 0))}</span>
              </div>
            ))}
            <div className="mt-1 border-t border-border pt-2 text-sm font-semibold text-text">
              Total efectivo: {money(efectivoContado)}
            </div>
          </div>
        </Card>

        <Card>
          <h4 className="mb-3 text-sm font-semibold text-text">Otras fuentes (cuentas, préstamos, gastos por reponer)</h4>
          <div className="flex flex-col gap-2">
            {otrasFuentes.map((f, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  placeholder="Ej: Nequi, o 'Jhonny usó'"
                  value={f.etiqueta}
                  onChange={(e) => actualizarFuente(i, 'etiqueta', e.target.value)}
                />
                <Input
                  type="number"
                  placeholder="monto"
                  className="w-32"
                  value={f.monto}
                  onChange={(e) => actualizarFuente(i, 'monto', e.target.value)}
                />
                <button onClick={() => quitarFuente(i)} className="text-text-faint hover:text-error" title="Quitar">
                  ×
                </button>
              </div>
            ))}
            <Button variant="ghost" onClick={agregarFuente} className="self-start">
              + Agregar fuente
            </Button>
            <div className="mt-1 border-t border-border pt-2 text-sm font-semibold text-text">
              Total otras fuentes: {money(totalOtrasFuentes)}
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-surface-2 p-3">
            <span className="block text-xs text-text-muted">Debería haber (esperado)</span>
            <b className="text-lg text-text">{money(esperado)}</b>
          </div>
          <div className="rounded-lg bg-surface-2 p-3">
            <span className="block text-xs text-text-muted">Hay (efectivo + otras fuentes)</span>
            <b className="text-lg text-text">{money(efectivoContado + totalOtrasFuentes)}</b>
          </div>
          <div className={`rounded-lg p-3 ${faltaReponer > 0 ? 'bg-error/10' : 'bg-success/10'}`}>
            <span className="block text-xs text-text-muted">{faltaReponer > 0 ? 'Falta reponer' : 'Cuadrado / sobrante'}</span>
            <b className={`text-lg ${faltaReponer > 0 ? 'text-error' : 'text-success'}`}>{money(Math.abs(faltaReponer))}</b>
          </div>
        </div>

        <div className="mt-3">
          <Label>Observaciones (opcional)</Label>
          <Input value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
        </div>

        <Button onClick={guardar} className="mt-3">
          Guardar arqueo
        </Button>
      </Card>

      {historial.length > 0 && (
        <Card>
          <h4 className="mb-3 text-sm font-semibold text-text">Historial de arqueos</h4>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-2 text-text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Fecha</th>
                  <th className="px-3 py-2 font-medium">Esperado</th>
                  <th className="px-3 py-2 font-medium">Efectivo</th>
                  <th className="px-3 py-2 font-medium">Otras fuentes</th>
                  <th className="px-3 py-2 font-medium">Falta reponer</th>
                  <th className="px-3 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {historial.map((a) => (
                  <tr key={a.id} className="border-t border-border">
                    <td className="px-3 py-2 text-text-muted">{a.fecha}</td>
                    <td className="px-3 py-2 text-text">{money(a.esperado)}</td>
                    <td className="px-3 py-2 text-text">{money(a.efectivo_contado)}</td>
                    <td className="px-3 py-2 text-text">
                      {money(a.items.reduce((s, i) => s + i.monto, 0))}
                      {a.items.length > 0 && (
                        <span className="ml-1 text-xs text-text-faint">({a.items.map((i) => i.etiqueta).join(', ')})</span>
                      )}
                    </td>
                    <td className={`px-3 py-2 font-semibold ${a.faltaReponer > 0 ? 'text-error' : 'text-success'}`}>
                      {money(Math.abs(a.faltaReponer))}
                    </td>
                    <td className="px-3 py-2">
                      <Button variant="ghost" onClick={() => eliminarArqueo(a.id)}>
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
