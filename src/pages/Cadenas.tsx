import { useEffect, useState, useCallback } from 'react';
import type { FormEvent } from 'react';
import { api } from '../utils/api';
import { money } from '../utils/money';
import { Card } from '../components/ui/Card';
import { Input, Label, Select } from '../components/ui/Field';
import { Button } from '../components/ui/Button';
import { Banner } from '../components/ui/Banner';
import type { Cadena, Participante, PuestoCadena } from '../types';

interface Jugador {
  id: number;
  cadena_id: number;
  participante_id: number;
  nombre: string;
}

const FORM_INICIAL = {
  nombre: '',
  anio: new Date().getFullYear(),
  valor_aporte_quincenal: 0,
  numero_puestos: 20,
  fecha_inicio: '',
  cadena_origen_id: '',
};

function estadoLabel(estado: Cadena['estado']) {
  if (estado === 'ACTIVA') return { texto: 'Activa', clase: 'bg-success/15 text-success' };
  if (estado === 'PENDIENTE_SORTEO') return { texto: 'Armando lista / sorteo', clase: 'bg-warning/15 text-warning' };
  return { texto: 'Borrador', clase: 'bg-surface-3 text-text-muted' };
}

export function Cadenas() {
  const [cadenas, setCadenas] = useState<Cadena[]>([]);
  const [participantesPool, setParticipantesPool] = useState<Participante[]>([]);
  const [form, setForm] = useState(FORM_INICIAL);
  const [nuevoParticipante, setNuevoParticipante] = useState('');
  const [seleccionId, setSeleccionId] = useState<number | null>(null);
  const [jugadores, setJugadores] = useState<Jugador[]>([]);
  const [puestos, setPuestos] = useState<PuestoCadena[]>([]);
  const [puestoForm, setPuestoForm] = useState<Record<number, { numero_puesto: string; fraccion: string }>>({});
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const seleccion = cadenas.find((c) => c.id === seleccionId) || null;

  const loadCadenas = useCallback(async () => {
    setCadenas(await api.get<Cadena[]>('/cadenas'));
  }, []);

  const loadDetalle = useCallback(async (id: number) => {
    const [jug, pue] = await Promise.all([
      api.get<Jugador[]>(`/participantes/cadena/${id}`),
      api.get<PuestoCadena[]>(`/sorteo/${id}`),
    ]);
    setJugadores(jug);
    setPuestos(pue);
  }, []);

  useEffect(() => {
    loadCadenas();
    api.get<Participante[]>('/participantes').then(setParticipantesPool);
  }, [loadCadenas]);

  useEffect(() => {
    if (seleccionId) loadDetalle(seleccionId);
  }, [seleccionId, loadDetalle]);

  function fail(err: unknown, fallback: string) {
    setError(err instanceof Error ? err.message : fallback);
  }

  async function crear(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const nueva = await api.post<Cadena>('/cadenas', {
        nombre: form.nombre,
        anio: Number(form.anio),
        valor_aporte_quincenal: Number(form.valor_aporte_quincenal),
        numero_puestos: Number(form.numero_puestos),
        fecha_inicio: form.fecha_inicio,
        cadena_origen_id: form.cadena_origen_id ? Number(form.cadena_origen_id) : null,
      });
      setMsg(`Cadena "${nueva.nombre}" creada`);
      setForm(FORM_INICIAL);
      await loadCadenas();
      setSeleccionId(nueva.id);
    } catch (err) {
      fail(err, 'Error al crear cadena');
    }
  }

  async function agregarJugador(participanteId: number) {
    if (!seleccionId) return;
    setError('');
    try {
      await api.post('/participantes/vincular', {
        cadena_id: seleccionId,
        participante_id: participanteId,
        cantidad_puestos: 1,
        fraccion_total: 1,
      });
      await loadDetalle(seleccionId);
    } catch (err) {
      fail(err, 'Error al agregar jugador');
    }
  }

  async function crearYAgregarParticipante(e: FormEvent) {
    e.preventDefault();
    if (!nuevoParticipante.trim()) return;
    setError('');
    try {
      const creado = await api.post<Participante>('/participantes', { nombre: nuevoParticipante.trim() });
      setParticipantesPool((prev) => [...prev, creado].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      setNuevoParticipante('');
      await agregarJugador(creado.id);
    } catch (err) {
      fail(err, 'Error al crear participante');
    }
  }

  async function asignarPuesto(jugador: Jugador) {
    if (!seleccionId) return;
    const valores = puestoForm[jugador.participante_id];
    if (!valores?.numero_puesto) return;
    setError('');
    try {
      await api.post('/sorteo', {
        cadena_id: seleccionId,
        numero_puesto: Number(valores.numero_puesto),
        participante_id: jugador.participante_id,
        fraccion: Number(valores.fraccion || '1'),
      });
      await loadDetalle(seleccionId);
    } catch (err) {
      fail(err, 'Error al asignar puesto');
    }
  }

  async function cerrarSorteo() {
    if (!seleccionId) return;
    setError('');
    try {
      await api.post(`/cadenas/${seleccionId}/cerrar-sorteo`);
      setMsg('Sorteo cerrado, cadena activa');
      await loadCadenas();
    } catch (err) {
      fail(err, 'Error al cerrar sorteo — revisa que todos los puestos sumen fracción completa');
    }
  }

  const jugadoresSinParticipante = participantesPool.filter(
    (p) => !jugadores.some((j) => j.participante_id === p.id),
  );

  const puestosPorParticipante = new Map(puestos.map((p) => [p.participante_id, p]));
  const sumaFracciones: Record<number, number> = {};
  for (const p of puestos) sumaFracciones[p.numero_puesto] = (sumaFracciones[p.numero_puesto] || 0) + p.fraccion;
  const puestosCompletos =
    seleccion != null &&
    Array.from({ length: seleccion.numero_puestos }, (_, i) => i + 1).every(
      (n) => Math.round((sumaFracciones[n] || 0) * 10000) / 10000 === 1,
    );

  return (
    <div className="flex flex-col gap-6">
      <h2 className="font-display text-2xl font-bold text-text">Cadenas</h2>
      {msg && <Banner>{msg}</Banner>}
      {error && <Banner kind="error">{error}</Banner>}

      <Card>
        <h3 className="mb-3 font-semibold text-text">Nueva cadena</h3>
        <form onSubmit={crear} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <Label>Nombre</Label>
            <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required />
          </div>
          <div>
            <Label>Año</Label>
            <Input type="number" value={form.anio} onChange={(e) => setForm({ ...form, anio: Number(e.target.value) })} />
          </div>
          <div>
            <Label>Número puestos</Label>
            <Input
              type="number"
              value={form.numero_puestos}
              onChange={(e) => setForm({ ...form, numero_puestos: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Valor puesto quincenal (completo)</Label>
            <Input
              type="number"
              value={form.valor_aporte_quincenal}
              onChange={(e) => setForm({ ...form, valor_aporte_quincenal: Number(e.target.value) })}
            />
            {form.valor_aporte_quincenal > 0 && (
              <p className="mt-1 text-xs text-text-faint">
                3/4: {money(form.valor_aporte_quincenal * 0.75)} · 1/2: {money(form.valor_aporte_quincenal * 0.5)} · 1/4:{' '}
                {money(form.valor_aporte_quincenal * 0.25)}
              </p>
            )}
          </div>
          <div>
            <Label>Fecha inicio (primera quincena)</Label>
            <Input type="date" value={form.fecha_inicio} onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })} required />
          </div>
          <div>
            <Label>Clonar jugadores desde (opcional)</Label>
            <Select value={form.cadena_origen_id} onChange={(e) => setForm({ ...form, cadena_origen_id: e.target.value })}>
              <option value="">— Empezar sin nadie —</option>
              {cadenas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre} {c.anio}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex items-end">
            <Button type="submit">Crear cadena</Button>
          </div>
        </form>
      </Card>

      <Card>
        <h3 className="mb-3 font-semibold text-text">Cadenas existentes</h3>
        <div className="flex flex-col gap-2">
          {cadenas.map((c) => {
            const badge = estadoLabel(c.estado);
            return (
              <button
                key={c.id}
                onClick={() => setSeleccionId(c.id)}
                className={`flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                  seleccionId === c.id ? 'border-accent bg-accent/10' : 'border-border hover:bg-surface-2'
                }`}
              >
                <span className="font-medium text-text">
                  {c.nombre} {c.anio}
                </span>
                <span className="flex items-center gap-3 text-text-muted">
                  {money(c.valor_aporte_quincenal)}/quincena · {c.numero_puestos} puestos
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge.clase}`}>{badge.texto}</span>
                </span>
              </button>
            );
          })}
          {!cadenas.length && <p className="text-sm text-text-faint">Todavía no hay cadenas.</p>}
        </div>
      </Card>

      {seleccion && (
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-text">
              Jugadores de {seleccion.nombre} {seleccion.anio}
            </h3>
            {seleccion.estado === 'PENDIENTE_SORTEO' && (
              <Button onClick={cerrarSorteo} disabled={!puestosCompletos}>
                Cerrar sorteo y activar
              </Button>
            )}
          </div>

          {seleccion.estado === 'PENDIENTE_SORTEO' && (
            <div className="mb-4 flex flex-wrap items-end gap-2">
              <Select
                className="w-auto min-w-[200px]"
                value=""
                onChange={(e) => e.target.value && agregarJugador(Number(e.target.value))}
              >
                <option value="">+ Agregar jugador existente...</option>
                {jugadoresSinParticipante.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </Select>
              <form onSubmit={crearYAgregarParticipante} className="flex items-end gap-2">
                <Input
                  placeholder="Nombre de alguien nuevo"
                  value={nuevoParticipante}
                  onChange={(e) => setNuevoParticipante(e.target.value)}
                />
                <Button type="submit" variant="ghost">
                  Crear y agregar
                </Button>
              </form>
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-2 text-text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Jugador</th>
                  <th className="px-3 py-2 font-medium">Puesto asignado</th>
                  {seleccion.estado === 'PENDIENTE_SORTEO' && <th className="px-3 py-2 font-medium">Asignar puesto (sorteo)</th>}
                </tr>
              </thead>
              <tbody>
                {jugadores.map((j) => {
                  const puesto = puestosPorParticipante.get(j.participante_id);
                  return (
                    <tr key={j.id} className="border-t border-border">
                      <td className="px-3 py-2 text-text">{j.nombre}</td>
                      <td className="px-3 py-2 text-text-muted">
                        {puesto ? `#${puesto.numero_puesto} (${puesto.fraccion})` : '— sin sorteo —'}
                      </td>
                      {seleccion.estado === 'PENDIENTE_SORTEO' && (
                        <td className="px-3 py-2">
                          {!puesto && (
                            <div className="flex gap-2">
                              <Input
                                type="number"
                                placeholder="# puesto"
                                className="w-24"
                                value={puestoForm[j.participante_id]?.numero_puesto ?? ''}
                                onChange={(e) =>
                                  setPuestoForm({
                                    ...puestoForm,
                                    [j.participante_id]: { ...puestoForm[j.participante_id], numero_puesto: e.target.value },
                                  })
                                }
                              />
                              <Select
                                className="w-28"
                                value={puestoForm[j.participante_id]?.fraccion ?? '1'}
                                onChange={(e) =>
                                  setPuestoForm({
                                    ...puestoForm,
                                    [j.participante_id]: { ...puestoForm[j.participante_id], fraccion: e.target.value },
                                  })
                                }
                              >
                                <option value="1">Completo</option>
                                <option value="0.75">3/4</option>
                                <option value="0.5">Medio</option>
                                <option value="0.25">1/4</option>
                              </Select>
                              <Button variant="ghost" onClick={() => asignarPuesto(j)}>
                                Asignar
                              </Button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
                {!jugadores.length && (
                  <tr>
                    <td colSpan={3} className="px-3 py-4 text-center text-text-faint">
                      Todavía no hay jugadores en esta cadena.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
