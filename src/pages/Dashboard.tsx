import { useEffect, useState } from 'react';
import { api } from '../utils/api';
import { money } from '../utils/money';
import { Card } from '../components/ui/Card';
import { StatCard } from '../components/ui/StatCard';
import { Select } from '../components/ui/Field';
import { CadenaGrid } from '../components/cadena/CadenaGrid';
import { Arqueo } from '../components/cadena/Arqueo';
import type { Cadena, DashboardResumen } from '../types';

export function Dashboard() {
  const [data, setData] = useState<DashboardResumen | null>(null);
  const [cadenasActivas, setCadenasActivas] = useState<Cadena[]>([]);
  const [cadenaId, setCadenaId] = useState<number | null>(null);

  useEffect(() => {
    api.get<DashboardResumen>('/reportes/dashboard').then(setData);
    api.get<Cadena[]>('/cadenas').then((cadenas) => {
      const activas = cadenas.filter((c) => c.estado === 'ACTIVA');
      setCadenasActivas(activas);
      if (activas.length) setCadenaId(activas[0].id);
    });
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
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold text-text">Cadena vigente</h3>
          {cadenasActivas.length > 1 && (
            <Select
              value={cadenaId ?? ''}
              onChange={(e) => setCadenaId(Number(e.target.value))}
              className="w-auto"
            >
              {cadenasActivas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre} {c.anio}
                </option>
              ))}
            </Select>
          )}
        </div>

        {cadenaId ? (
          <CadenaGrid cadenaId={cadenaId} />
        ) : (
          <p className="text-sm text-text-faint">No hay ninguna cadena activa todavía.</p>
        )}
      </Card>

      {cadenaId && (
        <Card>
          <h3 className="mb-4 font-semibold text-text">Arqueo de caja</h3>
          <Arqueo cadenaId={cadenaId} />
        </Card>
      )}
    </div>
  );
}
