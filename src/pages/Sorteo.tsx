import { useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../utils/api';
import { Card } from '../components/ui/Card';
import { Input, Label, Select } from '../components/ui/Field';
import { Button } from '../components/ui/Button';
import { Banner } from '../components/ui/Banner';
import { Table } from '../components/ui/Table';
import type { PuestoCadena, TableRow } from '../types';

const FORM_INICIAL = { cadena_id: '', numero_puesto: '', participante_id: '', fraccion: '1', observaciones: '', motivo: '' };

export function Sorteo() {
  const [cadenaId, setCadenaId] = useState('');
  const [items, setItems] = useState<PuestoCadena[]>([]);
  const [form, setForm] = useState(FORM_INICIAL);
  const [error, setError] = useState('');

  async function load() {
    if (cadenaId) setItems(await api.get<PuestoCadena[]>(`/sorteo/${cadenaId}`));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/sorteo', {
        ...form,
        cadena_id: Number(form.cadena_id),
        numero_puesto: Number(form.numero_puesto),
        participante_id: Number(form.participante_id),
        fraccion: Number(form.fraccion),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar sorteo');
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="font-display text-2xl font-bold text-text">Sorteo físico de puestos</h2>
      {error && <Banner kind="error">{error}</Banner>}

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label>ID cadena</Label>
            <Input value={cadenaId} onChange={(e) => setCadenaId(e.target.value)} />
          </div>
          <Button variant="ghost" onClick={load}>
            Consultar
          </Button>
        </div>
      </Card>

      <Card>
        <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <Label>ID cadena</Label>
            <Input value={form.cadena_id} onChange={(e) => setForm({ ...form, cadena_id: e.target.value })} />
          </div>
          <div>
            <Label>Número puesto (balota)</Label>
            <Input value={form.numero_puesto} onChange={(e) => setForm({ ...form, numero_puesto: e.target.value })} />
          </div>
          <div>
            <Label>ID participante</Label>
            <Input value={form.participante_id} onChange={(e) => setForm({ ...form, participante_id: e.target.value })} />
          </div>
          <div>
            <Label>Fracción</Label>
            <Select value={form.fraccion} onChange={(e) => setForm({ ...form, fraccion: e.target.value })}>
              <option value="1">Puesto completo</option>
              <option value="0.5">Medio puesto</option>
              <option value="0.25">Cuarto puesto</option>
            </Select>
          </div>
          <div>
            <Label>Observaciones</Label>
            <Input value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} />
          </div>
          <div>
            <Label>Motivo</Label>
            <Input value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} />
          </div>
          <div className="flex items-end">
            <Button type="submit">Registrar sorteo</Button>
          </div>
        </form>
      </Card>

      <Table data={items as unknown as TableRow[]} />
    </div>
  );
}
