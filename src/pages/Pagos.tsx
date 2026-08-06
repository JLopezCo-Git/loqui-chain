import { useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../utils/api';
import { Card } from '../components/ui/Card';
import { Input, Label } from '../components/ui/Field';
import { Button } from '../components/ui/Button';
import { Banner } from '../components/ui/Banner';
import { Table } from '../components/ui/Table';
import type { Obligacion, TableRow } from '../types';

const FORM_INICIAL = { obligacion_id: '', valor_pago: '', metodo_pago: 'Nequi', comprobante_url: '', observaciones: '' };

export function Pagos() {
  const [cadenaId, setCadenaId] = useState('');
  const [pendientes, setPendientes] = useState<Obligacion[]>([]);
  const [form, setForm] = useState(FORM_INICIAL);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  async function load() {
    if (cadenaId) setPendientes(await api.get<Obligacion[]>(`/pagos/pendientes/${cadenaId}`));
  }

  async function registrar(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/pagos', { ...form, obligacion_id: Number(form.obligacion_id), valor_pago: Number(form.valor_pago) });
      setMsg('Pago registrado');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar pago');
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="font-display text-2xl font-bold text-text">Pagos</h2>
      {msg && <Banner>{msg}</Banner>}
      {error && <Banner kind="error">{error}</Banner>}

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label>ID cadena</Label>
            <Input value={cadenaId} onChange={(e) => setCadenaId(e.target.value)} />
          </div>
          <Button variant="ghost" onClick={load}>
            Consultar pendientes
          </Button>
        </div>
      </Card>

      <div>
        <h3 className="mb-2 font-semibold text-text">Obligaciones pendientes</h3>
        <Table data={pendientes as unknown as TableRow[]} />
      </div>

      <Card>
        <form onSubmit={registrar} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {(Object.keys(form) as Array<keyof typeof form>).map((k) => (
            <div key={k}>
              <Label>{k}</Label>
              <Input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
            </div>
          ))}
          <div className="flex items-end">
            <Button type="submit">Registrar pago</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
