import express from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { audit } from '../services/auditService.js';
import { generarObligacionesParaPuesto } from '../services/cadenaService.js';

const router = express.Router();
router.use(requireAuth, requireAdmin);

const puestoSchema = z.object({
  cadena_id: z.number().int(),
  numero_puesto: z.number().int().positive(),
  participante_id: z.number().int(),
  fraccion: z.number().positive().max(1),
  observaciones: z.string().optional().nullable(),
  motivo: z.string().optional().nullable()
});

router.get('/:cadenaId', (req, res) => {
  res.json(db.prepare(`
    SELECT pc.*, p.nombre participante
    FROM puestos_cadena pc
    JOIN participantes p ON p.id = pc.participante_id
    WHERE pc.cadena_id = ?
    ORDER BY pc.numero_puesto, pc.fraccion DESC
  `).all(req.params.cadenaId));
});

router.post('/', (req, res) => {
  const parsed = puestoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const p = parsed.data;
  const cadena = db.prepare('SELECT * FROM cadenas WHERE id = ?').get(p.cadena_id);
  if (!cadena) return res.status(404).json({ error: 'Cadena no existe' });
  // Mientras se arma el sorteo el número de puestos todavía no está fijo (se
  // deduce al cerrar). Una vez ACTIVA, el rango ya quedó fijo por cerrarSorteoYActivar.
  if (cadena.estado === 'ACTIVA' && p.numero_puesto > cadena.numero_puestos) {
    return res.status(400).json({ error: 'Puesto fuera de rango' });
  }

  const total = db.prepare(`
    SELECT COALESCE(SUM(fraccion), 0) total
    FROM puestos_cadena
    WHERE cadena_id = ? AND numero_puesto = ?
  `).get(p.cadena_id, p.numero_puesto).total;

  if (total + p.fraccion > 1.0001) return res.status(400).json({ error: 'El puesto supera fracción 1' });

  const result = db.prepare(`
    INSERT INTO puestos_cadena(cadena_id, numero_puesto, participante_id, fraccion, asignado_por, observaciones)
    VALUES (?,?,?,?,?,?)
  `).run(p.cadena_id, p.numero_puesto, p.participante_id, p.fraccion, req.user.id, p.observaciones || null);

  const item = db.prepare('SELECT * FROM puestos_cadena WHERE id = ?').get(result.lastInsertRowid);
  audit({ usuarioId: req.user.id, entidad: 'puestos_cadena', entidadId: item.id, accion: 'REGISTRAR_SORTEO', after: item, motivo: p.motivo });

  // Si la cadena ya está activa (calendario ya generado), este puesto llega
  // "tarde" -- generarle de una vez sus obligaciones y, si le toca, su entrega.
  if (cadena.estado === 'ACTIVA') {
    generarObligacionesParaPuesto(p.cadena_id, item);
  }

  res.status(201).json(item);
});

// Deshacer un puesto asignado por error, solo mientras la cadena no ha
// cerrado sorteo (antes de eso no existen obligaciones/entregas que reversar).
router.delete('/:id', (req, res) => {
  const puesto = db.prepare('SELECT * FROM puestos_cadena WHERE id = ?').get(req.params.id);
  if (!puesto) return res.status(404).json({ error: 'Puesto no existe' });

  const cadena = db.prepare('SELECT * FROM cadenas WHERE id = ?').get(puesto.cadena_id);
  if (cadena.estado !== 'PENDIENTE_SORTEO') {
    return res.status(400).json({ error: 'Solo se puede deshacer un puesto mientras la cadena está armando lista (antes de cerrar sorteo)' });
  }

  db.prepare('DELETE FROM puestos_cadena WHERE id = ?').run(req.params.id);
  audit({ usuarioId: req.user.id, entidad: 'puestos_cadena', entidadId: puesto.id, accion: 'DESHACER_SORTEO', before: puesto });
  res.status(204).end();
});

export default router;
