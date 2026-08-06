import express from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { audit } from '../services/auditService.js';

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
  if (p.numero_puesto > cadena.numero_puestos) return res.status(400).json({ error: 'Puesto fuera de rango' });

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
  res.status(201).json(item);
});

export default router;
