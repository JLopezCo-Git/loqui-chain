import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../utils/api';
import { Card } from '../components/ui/Card';
import { Input, Label } from '../components/ui/Field';
import { Button } from '../components/ui/Button';
import { Banner } from '../components/ui/Banner';
import { Table } from '../components/ui/Table';
import type { Participante, TableRow } from '../types';

const FORM_INICIAL = { nombre: '', documento: '', celular: '', email: '', observaciones: '' };
const LINK_INICIAL = { cadena_id: '', participante_id: '', cantidad_puestos: '1', fraccion_total: '1' };

export function Participantes() {
  const [items, setItems] = useState<Participante[]>([]);
  const [form, setForm] = useState(FORM_INICIAL);
  const [link, setLink] = useState(LINK_INICIAL);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setItems(await api.get<Participante[]>('/participantes'));
  }

  useEffect(() => {
    load();
  }, []);

  async function crear(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/participantes', form);
      setMsg('Participante creado');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear participante');
    }
  }

  async function vincular(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/participantes/vincular', {
        cadena_id: Number(link.cadena_id),
        participante_id: Number(link.participante_id),
        cantidad_puestos: Number(link.cantidad_puestos),
        fraccion_total: Number(link.fraccion_total),
      });
      setMsg('Participante vinculado a la cadena');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al vincular participante');
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="font-display text-2xl font-bold text-text">Participantes</h2>
      {msg && <Banner>{msg}</Banner>}
      {error && <Banner kind="error">{error}</Banner>}

      <Card>
        <form onSubmit={crear} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {(Object.keys(form) as Array<keyof typeof form>).map((k) => (
            <div key={k}>
              <Label>{k}</Label>
              <Input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
            </div>
          ))}
          <div className="flex items-end">
            <Button type="submit">Crear participante</Button>
          </div>
        </form>
      </Card>

      <Card>
        <form onSubmit={vincular} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {(Object.keys(link) as Array<keyof typeof link>).map((k) => (
            <div key={k}>
              <Label>{k}</Label>
              <Input value={link[k]} onChange={(e) => setLink({ ...link, [k]: e.target.value })} />
            </div>
          ))}
          <div className="flex items-end">
            <Button type="submit">Vincular a cadena</Button>
          </div>
        </form>
      </Card>

      <Table data={items as unknown as TableRow[]} />
    </div>
  );
}
