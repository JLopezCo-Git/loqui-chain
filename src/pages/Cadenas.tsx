import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../utils/api';
import { Card } from '../components/ui/Card';
import { Input, Label } from '../components/ui/Field';
import { Button } from '../components/ui/Button';
import { Banner } from '../components/ui/Banner';
import { Table } from '../components/ui/Table';
import type { Cadena, TableRow } from '../types';

const FORM_INICIAL = { nombre: '', anio: 2026, valor_aporte_quincenal: 0, numero_puestos: 1, fecha_inicio: '' };

export function Cadenas() {
  const [cadenas, setCadenas] = useState<Cadena[]>([]);
  const [form, setForm] = useState(FORM_INICIAL);
  const [cadenaId, setCadenaId] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setCadenas(await api.get<Cadena[]>('/cadenas'));
  }

  useEffect(() => {
    load();
  }, []);

  async function crear(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/cadenas', {
        ...form,
        anio: Number(form.anio),
        valor_aporte_quincenal: Number(form.valor_aporte_quincenal),
        numero_puestos: Number(form.numero_puestos),
      });
      setMsg('Cadena creada');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear cadena');
    }
  }

  async function accion(path: string) {
    setError('');
    try {
      await api.post(path, { fecha_inicio: form.fecha_inicio });
      setMsg('Acción ejecutada');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al ejecutar acción');
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="font-display text-2xl font-bold text-text">Cadenas</h2>
      {msg && <Banner>{msg}</Banner>}
      {error && <Banner kind="error">{error}</Banner>}

      <Card>
        <form onSubmit={crear} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <Label>Nombre</Label>
            <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
          </div>
          <div>
            <Label>Año</Label>
            <Input type="number" value={form.anio} onChange={(e) => setForm({ ...form, anio: Number(e.target.value) })} />
          </div>
          <div>
            <Label>Aporte quincenal</Label>
            <Input
              type="number"
              value={form.valor_aporte_quincenal}
              onChange={(e) => setForm({ ...form, valor_aporte_quincenal: Number(e.target.value) })}
            />
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
            <Label>Fecha inicio</Label>
            <Input type="date" value={form.fecha_inicio} onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })} />
          </div>
          <div className="flex items-end">
            <Button type="submit">Crear cadena</Button>
          </div>
        </form>
      </Card>

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label>ID cadena</Label>
            <Input value={cadenaId} onChange={(e) => setCadenaId(e.target.value)} />
          </div>
          <Button variant="ghost" onClick={() => accion(`/cadenas/${cadenaId}/calendario`)}>
            Generar calendario
          </Button>
          <Button variant="ghost" onClick={() => accion(`/cadenas/${cadenaId}/confirmar-sorteo`)}>
            Confirmar sorteo
          </Button>
          <Button variant="ghost" onClick={() => accion(`/cadenas/${cadenaId}/activar`)}>
            Activar
          </Button>
        </div>
      </Card>

      <Table data={cadenas as unknown as TableRow[]} />
    </div>
  );
}
