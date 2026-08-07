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
  const [editandoCadena, setEditandoCadena] = useState(false);
  const [editCadenaForm, setEditCadenaForm] = useState(FORM_INICIAL);
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
    setEditandoCadena(false);
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
      setPuestoForm({ ...puestoForm, [jugador.participante_id]: { numero_puesto: '', fraccion: '1' } });
      await loadDetalle(seleccionId);
    } catch (err) {
      fail(err, 'Error al asignar puesto');
    }
  }

  function empezarEdicionCadena() {
    if (!seleccion) return;
    setEditCadenaForm({
      nombre: seleccion.nombre,
      anio: seleccion.anio,
      valor_aporte_quincenal: seleccion.valor_aporte_quincenal,
      numero_puestos: seleccion.numero_puestos,
      fecha_inicio: seleccion.fecha_inicio || '',
      cadena_origen_id: '',
    });
    setEditandoCadena(true);
  }

  async function guardarEdicionCadena() {
    if (!seleccionId) return;
    setError('');
    try {
      await api.patch(`/cadenas/${seleccionId}`, {
        nombre: editCadenaForm.nombre,
        anio: Number(editCadenaForm.anio),
        valor_aporte_quincenal: Number(editCadenaForm.valor_aporte_quincenal),
        numero_puestos: Number(editCadenaForm.numero_puestos),
        fecha_inicio: editCadenaForm.fecha_inicio,
      });
      setMsg('Cadena actualizada');
      setEditandoCadena(false);
      await loadCadenas();
    } catch (err) {
      fail(err, 'Error al editar cadena');
    }
  }

  async function eliminarCadena() {
    if (!seleccion) return;
    if (!window.confirm(`¿Eliminar "${seleccion.nombre} ${seleccion.anio}"? Esto borra jugadores, sorteo, pagos y entregas asociados.`)) return;
    setError('');
    try {
      await api.delete(`/cadenas/${seleccion.id}`);
      setMsg('Cadena eliminada');
      setSeleccionId(null);
      await loadCadenas();
    } catch (err) {
      fail(err, 'Error al eliminar cadena');
    }
  }

  async function quitarJugador(jugador: Jugador) {
    if (!seleccionId) return;
    if (!window.confirm(`¿Quitar a ${jugador.nombre} de esta cadena?`)) return;
    setError('');
    try {
      await api.delete(`/participantes/vincular/${seleccionId}/${jugador.participante_id}`);
      await loadDetalle(seleccionId);
    } catch (err) {
      fail(err, 'Error al quitar jugador');
    }
  }

  async function deshacerPuesto(puestoId: number) {
    if (!seleccionId) return;
    setError('');
    try {
      await api.delete(`/sorteo/${puestoId}`);
      await loadDetalle(seleccionId);
    } catch (err) {
      fail(err, 'Error al deshacer puesto');
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

  const puestosPorParticipante = new Map<number, PuestoCadena[]>();
  for (const p of puestos) {
    const lista = puestosPorParticipante.get(p.participante_id) || [];
    lista.push(p);
    puestosPorParticipante.set(p.participante_id, lista);
  }
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
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold text-text">
              {seleccion.nombre} {seleccion.anio}
            </h3>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={empezarEdicionCadena}>
                Editar cadena
              </Button>
              <Button variant="ghost" onClick={eliminarCadena}>
                Eliminar cadena
              </Button>
              {seleccion.estado === 'PENDIENTE_SORTEO' && (
                <Button onClick={cerrarSorteo} disabled={!puestosCompletos}>
                  Cerrar sorteo y activar
                </Button>
              )}
            </div>
          </div>

          {editandoCadena && (
            <div className="mb-4 rounded-lg border border-border p-3">
              {seleccion.estado === 'ACTIVA' && (
                <Banner kind="error">
                  Esta cadena ya está activa: cambiar el valor de puesto o el número de puestos NO recalcula las
                  obligaciones/entregas ya generadas.
                </Banner>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <Label>Nombre</Label>
                  <Input value={editCadenaForm.nombre} onChange={(e) => setEditCadenaForm({ ...editCadenaForm, nombre: e.target.value })} />
                </div>
                <div>
                  <Label>Año</Label>
                  <Input
                    type="number"
                    value={editCadenaForm.anio}
                    onChange={(e) => setEditCadenaForm({ ...editCadenaForm, anio: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Número puestos</Label>
                  <Input
                    type="number"
                    value={editCadenaForm.numero_puestos}
                    onChange={(e) => setEditCadenaForm({ ...editCadenaForm, numero_puestos: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Valor puesto quincenal</Label>
                  <Input
                    type="number"
                    value={editCadenaForm.valor_aporte_quincenal}
                    onChange={(e) => setEditCadenaForm({ ...editCadenaForm, valor_aporte_quincenal: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Fecha inicio</Label>
                  <Input
                    type="date"
                    value={editCadenaForm.fecha_inicio}
                    onChange={(e) => setEditCadenaForm({ ...editCadenaForm, fecha_inicio: e.target.value })}
                  />
                </div>
                <div className="flex items-end gap-2">
                  <Button onClick={guardarEdicionCadena}>Guardar cambios</Button>
                  <Button variant="ghost" onClick={() => setEditandoCadena(false)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            </div>
          )}

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
                  <th className="px-3 py-2 font-medium">Puestos asignados</th>
                  {seleccion.estado === 'PENDIENTE_SORTEO' && (
                    <>
                      <th className="px-3 py-2 font-medium">Asignar puesto (sorteo)</th>
                      <th className="px-3 py-2 font-medium"></th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {jugadores.map((j) => {
                  const puestosJugador = puestosPorParticipante.get(j.participante_id) || [];
                  const totalFraccion = puestosJugador.reduce((sum, p) => sum + p.fraccion, 0);
                  return (
                    <tr key={j.id} className="border-t border-border">
                      <td className="px-3 py-2 text-text">{j.nombre}</td>
                      <td className="px-3 py-2 text-text-muted">
                        {puestosJugador.length ? (
                          <div className="flex flex-wrap items-center gap-1">
                            {puestosJugador.map((p) => (
                              <span key={p.id} className="flex items-center gap-1 rounded-full bg-surface-3 px-2 py-0.5 text-xs">
                                #{p.numero_puesto} ({p.fraccion})
                                {seleccion.estado === 'PENDIENTE_SORTEO' && (
                                  <button
                                    onClick={() => deshacerPuesto(p.id)}
                                    title="Deshacer este puesto"
                                    className="text-text-faint hover:text-error"
                                  >
                                    ×
                                  </button>
                                )}
                              </span>
                            ))}
                            <span className="text-xs text-text-faint">= {totalFraccion} puesto(s)</span>
                          </div>
                        ) : (
                          '— sin sorteo —'
                        )}
                      </td>
                      {seleccion.estado === 'PENDIENTE_SORTEO' && (
                        <>
                          <td className="px-3 py-2">
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
                                {puestosJugador.length ? 'Agregar otro puesto' : 'Asignar'}
                              </Button>
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <Button variant="ghost" onClick={() => quitarJugador(j)}>
                              Quitar
                            </Button>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
                {!jugadores.length && (
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-center text-text-faint">
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
