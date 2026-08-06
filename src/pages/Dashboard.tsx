import { useEffect, useState } from 'react';
import { api } from '../utils/api';
import { money } from '../utils/money';
import { Card } from '../components/ui/Card';
import { StatCard } from '../components/ui/StatCard';
import type { DashboardResumen } from '../types';

const PASOS = [
  'Crear cadena.',
  'Crear/vincular participantes.',
  'Generar calendario.',
  'Registrar sorteo físico con balotas.',
  'Confirmar sorteo.',
  'Activar cadena.',
  'Registrar pagos y entregas.',
];

export function Dashboard() {
  const [data, setData] = useState<DashboardResumen | null>(null);

  useEffect(() => {
    api.get<DashboardResumen>('/reportes/dashboard').then(setData);
  }, []);

  if (!data) return <p className="text-text-muted">Cargando...</p>;

  return (
    <div className="flex flex-col gap-6">
      <h2 className="font-display text-2xl font-bold text-text">Dashboard</h2>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Cadenas" value={data.cadenasTotal} />
        <StatCard label="Activas" value={data.cadenasActivas} />
        <StatCard label="Caja global" value={money(data.cajaGlobal)} />
        <StatCard label="Pendiente" value={money(data.pendienteGlobal)} />
        <StatCard label="Entregas pendientes" value={data.entregasPendientes} />
      </div>

      <Card>
        <h3 className="mb-3 font-semibold text-text">Flujo correcto</h3>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-text-muted">
          {PASOS.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
