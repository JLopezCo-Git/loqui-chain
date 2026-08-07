import { useEffect, useState, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';
import { api } from '../utils/api';
import { money } from '../utils/money';
import { Card } from '../components/ui/Card';
import { StatCard } from '../components/ui/StatCard';
import { Select } from '../components/ui/Field';
import { CadenaGrid } from '../components/cadena/CadenaGrid';
import { AgendaQuincena } from '../components/cadena/AgendaQuincena';
import { Arqueo } from '../components/cadena/Arqueo';
import { AtencionRequerida } from '../components/dashboard/AtencionRequerida';
import { useIsMobile } from '../hooks/useIsMobile';
import type { Cadena, DashboardResumen } from '../types';

export function Dashboard() {
  const [data, setData] = useState<DashboardResumen | null>(null);
  const [cadenasActivas, setCadenasActivas] = useState<Cadena[]>([]);
  const [cadenaId, setCadenaId] = useState<number | null>(null);
  const [arqueoAbierto, setArqueoAbierto] = useState(false);
  const isMobile = useIsMobile();

  const loadResumen = useCallback(async () => {
    setData(await api.get<DashboardResumen>('/reportes/dashboard'));
  }, []);

  useEffect(() => {
    loadResumen();
    api.get<Cadena[]>('/cadenas').then((cadenas) => {
      const activas = cadenas.filter((c) => c.estado === 'ACTIVA');
      setCadenasActivas(activas);
      if (activas.length) setCadenaId(activas[0].id);
    });
  }, [loadResumen]);

  if (!data) {
    return (
      <div className="flex flex-col gap-6">
        <div className="h-8 w-40 animate-pulse rounded bg-surface-2" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <div className="h-20 animate-pulse rounded-lg bg-surface-2" />
          <div className="h-20 animate-pulse rounded-lg bg-surface-2" />
          <div className="h-20 animate-pulse rounded-lg bg-surface-2" />
        </div>
        <div className="h-40 animate-pulse rounded-lg bg-surface-2" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="font-display text-2xl font-bold text-text">Dashboard</h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard hero label="Caja disponible" value={money(data.cajaGlobal)} />
        <StatCard hero label="Falta por cobrar" value={money(data.pendienteGlobal)} tone={data.pendienteGlobal > 0 ? 'warning' : 'neutral'} />
        <StatCard hero label="Entregas pendientes" value={data.entregasPendientes} tone={data.entregasPendientes > 0 ? 'warning' : 'neutral'} />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2">
        <StatCard label="Cadenas totales" value={data.cadenasTotal} />
        <StatCard label="Cadenas activas" value={data.cadenasActivas} />
      </div>

      {cadenaId && <AtencionRequerida cadenaId={cadenaId} onAction={loadResumen} />}

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold text-text">Cadena vigente</h3>
          {cadenasActivas.length > 1 && (
            <Select value={cadenaId ?? ''} onChange={(e) => setCadenaId(Number(e.target.value))} className="w-auto">
              {cadenasActivas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre} {c.anio}
                </option>
              ))}
            </Select>
          )}
        </div>

        {cadenaId ? (
          isMobile ? (
            <AgendaQuincena cadenaId={cadenaId} />
          ) : (
            <CadenaGrid cadenaId={cadenaId} />
          )
        ) : (
          <p className="text-sm text-text-faint">No hay ninguna cadena activa todavía.</p>
        )}
      </Card>

      {cadenaId && (
        <Card id="arqueo">
          <button
            onClick={() => setArqueoAbierto((v) => !v)}
            className="flex w-full items-center justify-between gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-expanded={arqueoAbierto}
          >
            <h3 className="font-semibold text-text">Arqueo de caja</h3>
            <ChevronDown size={18} className={`text-text-muted transition-transform ${arqueoAbierto ? 'rotate-180' : ''}`} />
          </button>
          {arqueoAbierto && (
            <div className="mt-4">
              <Arqueo cadenaId={cadenaId} />
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
