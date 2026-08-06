import { useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../utils/api';
import { Card } from '../components/ui/Card';
import { Input, Label } from '../components/ui/Field';
import { Button } from '../components/ui/Button';
import { Banner } from '../components/ui/Banner';
import { Table } from '../components/ui/Table';
import type { Entrega, TableRow } from '../types';

const FORM_INICIAL = { entrega_id: '', valor_entregado: '', comprobante_url: '', observaciones: '' };

export function Entregas() {
  const [cadenaId, setCadenaId] = useState('');
  const [entregas, setEntregas] = useState<Entrega[]>([]);
  const [form, setForm] = useState(FORM_INICIAL);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  async function load() {
    if (cadenaId) setEntregas(await api.get<Entrega[]>(`/entregas/${cadenaId}`));
  }

  async function registrar(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/entregas/registrar', {
        ...form,
        entrega_id: Number(form.entrega_id),
        valor_entregado: Number(form.valor_entregado),
      });
      setMsg('Entrega registrada');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar entrega');
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="font-display text-2xl font-bold text-text">Entregas</h2>
      {msg && <Banner>{msg}</Banner>}
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

      <Table data={entregas as unknown as TableRow[]} />

      <Card>
        <form onSubmit={registrar} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(Object.keys(form) as Array<keyof typeof form>).map((k) => (
            <div key={k}>
              <Label>{k}</Label>
              <Input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
            </div>
          ))}
          <div className="flex items-end">
            <Button type="submit">Registrar entrega</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
