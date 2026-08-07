import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../utils/api';
import { Card } from '../components/ui/Card';
import { Input, Label } from '../components/ui/Field';
import { Button } from '../components/ui/Button';
import { Banner } from '../components/ui/Banner';
import type { Participante } from '../types';

const FORM_INICIAL = { nombre: '', celular: '', observaciones: '' };

type EditForm = { nombre: string; celular: string; observaciones: string };

export function Participantes() {
  const [items, setItems] = useState<Participante[]>([]);
  const [form, setForm] = useState(FORM_INICIAL);
  const [buscar, setBuscar] = useState('');
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ nombre: '', celular: '', observaciones: '' });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setItems(await api.get<Participante[]>('/participantes'));
  }

  useEffect(() => {
    load();
  }, []);

  function fail(err: unknown, fallback: string) {
    setError(err instanceof Error ? err.message : fallback);
  }

  async function crear(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/participantes', form);
      setMsg('Participante creado');
      setForm(FORM_INICIAL);
      await load();
    } catch (err) {
      fail(err, 'Error al crear participante');
    }
  }

  function empezarEdicion(p: Participante) {
    setEditandoId(p.id);
    setEditForm({ nombre: p.nombre, celular: p.celular || '', observaciones: p.observaciones || '' });
  }

  async function guardarEdicion(id: number) {
    setError('');
    try {
      await api.patch(`/participantes/${id}`, editForm);
      setEditandoId(null);
      await load();
    } catch (err) {
      fail(err, 'Error al editar participante');
    }
  }

  async function eliminar(p: Participante) {
    setError('');
    try {
      await api.delete(`/participantes/${p.id}`);
      setMsg(`${p.nombre} eliminado`);
      await load();
    } catch (err) {
      fail(err, `No se pudo eliminar a ${p.nombre}`);
    }
  }

  const filtrados = items.filter((p) => p.nombre.toLowerCase().includes(buscar.toLowerCase()));

  return (
    <div className="flex flex-col gap-6">
      <h2 className="font-display text-2xl font-bold text-text">Participantes</h2>
      {msg && <Banner>{msg}</Banner>}
      {error && <Banner kind="error">{error}</Banner>}

      <Card>
        <h3 className="mb-3 font-semibold text-text">Nuevo participante</h3>
        <form onSubmit={crear} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(Object.keys(form) as Array<keyof typeof form>).map((k) => (
            <div key={k}>
              <Label>{k === 'nombre' ? 'Nombre' : k === 'celular' ? 'Celular' : 'Observaciones'}</Label>
              <Input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
            </div>
          ))}
          <div className="flex items-end">
            <Button type="submit">Crear participante</Button>
          </div>
        </form>
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold text-text">Pool de participantes ({items.length})</h3>
          <input
            type="search"
            placeholder="Buscar por nombre..."
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            className="w-56 rounded-md border border-border bg-surface-2 px-3 py-1.5 text-sm text-text placeholder:text-text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        </div>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-2 text-text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Nombre</th>
                <th className="px-3 py-2 font-medium">Celular</th>
                <th className="px-3 py-2 font-medium">Observaciones</th>
                <th className="px-3 py-2 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  {editandoId === p.id ? (
                    <>
                      <td className="px-3 py-2">
                        <Input value={editForm.nombre} onChange={(e) => setEditForm({ ...editForm, nombre: e.target.value })} />
                      </td>
                      <td className="px-3 py-2">
                        <Input value={editForm.celular} onChange={(e) => setEditForm({ ...editForm, celular: e.target.value })} />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={editForm.observaciones}
                          onChange={(e) => setEditForm({ ...editForm, observaciones: e.target.value })}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2">
                          <Button onClick={() => guardarEdicion(p.id)}>Guardar</Button>
                          <Button variant="ghost" onClick={() => setEditandoId(null)}>
                            Cancelar
                          </Button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2 text-text">{p.nombre}</td>
                      <td className="px-3 py-2 text-text-muted">{p.celular || '—'}</td>
                      <td className="px-3 py-2 text-text-muted">{p.observaciones || '—'}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2">
                          <Button variant="ghost" onClick={() => empezarEdicion(p)}>
                            Editar
                          </Button>
                          <Button variant="ghost" onClick={() => eliminar(p)}>
                            Eliminar
                          </Button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {!filtrados.length && (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center text-text-faint">
                    {items.length ? 'Sin resultados para esa búsqueda.' : 'Todavía no hay participantes.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
