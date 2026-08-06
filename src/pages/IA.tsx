import { useState } from 'react';
import { api } from '../utils/api';
import { Card } from '../components/ui/Card';
import { Input, Label } from '../components/ui/Field';
import { Button } from '../components/ui/Button';
import { Banner } from '../components/ui/Banner';

interface ConsultaResponse {
  respuesta: string;
}

export function IA() {
  const [cadenaId, setCadenaId] = useState('');
  const [pregunta, setPregunta] = useState('');
  const [respuesta, setRespuesta] = useState('');
  const [error, setError] = useState('');

  async function consultar() {
    setError('');
    setRespuesta('');
    try {
      const r = await api.post<ConsultaResponse>('/ia/consultar', { cadena_id: Number(cadenaId), pregunta });
      setRespuesta(r.respuesta);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al consultar');
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="font-display text-2xl font-bold text-text">IA operativa</h2>
      <p className="text-sm text-text-muted">
        Motor de reglas de solo lectura sobre caja, pendientes y entregas de una cadena — no es un modelo de
        lenguaje. Ver <code className="text-text-faint">docs/ARCHITECTURE.md §5</code>.
      </p>

      {error && <Banner kind="error">{error}</Banner>}

      <Card>
        <div className="flex flex-col gap-3">
          <div>
            <Label>ID cadena</Label>
            <Input value={cadenaId} onChange={(e) => setCadenaId(e.target.value)} />
          </div>
          <div>
            <Label>Pregunta</Label>
            <Input placeholder="Ej: ¿cómo está la caja?" value={pregunta} onChange={(e) => setPregunta(e.target.value)} />
          </div>
          <div>
            <Button onClick={consultar}>Consultar</Button>
          </div>
          {respuesta && <Banner>{respuesta}</Banner>}
        </div>
      </Card>
    </div>
  );
}
