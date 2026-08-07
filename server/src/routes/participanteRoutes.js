import express from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { audit } from '../services/auditService.js';

const router = express.Router();
router.use(requireAuth, requireAdmin);

const participanteSchema = z.object({
  nombre: z.string().min(1),
  celular: z.string().optional().nullable(),
  observaciones: z.string().optional().nullable()
});

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT id, nombre, celular, estado, observaciones, creado_en FROM participantes ORDER BY nombre').all());
});

router.post('/', (req, res) => {
  const parsed = participanteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const p = parsed.data;
  const result = db.prepare(`
    INSERT INTO participantes(nombre, celular, observaciones)
    VALUES (?,?,?)
  `).run(p.nombre, p.celular || null, p.observaciones || null);

  const item = db
    .prepare('SELECT id, nombre, celular, estado, observaciones, creado_en FROM participantes WHERE id = ?')
    .get(result.lastInsertRowid);
  audit({ usuarioId: req.user.id, entidad: 'participantes', entidadId: item.id, accion: 'CREAR', after: item });
  res.status(201).json(item);
});

router.post('/vincular', (req, res) => {
  const schema = z.object({
    cadena_id: z.number().int(),
    participante_id: z.number().int(),
    cantidad_puestos: z.number().positive(),
    fraccion_total: z.number().positive(),
    observaciones: z.string().optional().nullable()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const v = parsed.data;
  db.prepare(`
    INSERT INTO cadena_participantes(cadena_id, participante_id, cantidad_puestos, fraccion_total, observaciones)
    VALUES (?,?,?,?,?)
    ON CONFLICT(cadena_id, participante_id) DO UPDATE SET
      cantidad_puestos = excluded.cantidad_puestos,
      fraccion_total = excluded.fraccion_total,
      observaciones = excluded.observaciones,
      activo = 1
  `).run(v.cadena_id, v.participante_id, v.cantidad_puestos, v.fraccion_total, v.observaciones || null);

  const item = db.prepare(`
    SELECT cp.*, p.nombre participante
    FROM cadena_participantes cp
    JOIN participantes p ON p.id = cp.participante_id
    WHERE cp.cadena_id = ? AND cp.participante_id = ?
  `).get(v.cadena_id, v.participante_id);

  audit({ usuarioId: req.user.id, entidad: 'cadena_participantes', entidadId: item.id, accion: 'VINCULAR', after: item });
  res.status(201).json(item);
});

router.get('/cadena/:cadenaId', (req, res) => {
  res.json(db.prepare(`
    SELECT cp.*, p.nombre, p.celular
    FROM cadena_participantes cp
    JOIN participantes p ON p.id = cp.participante_id
    WHERE cp.cadena_id = ?
    ORDER BY p.nombre
  `).all(req.params.cadenaId));
});

export default router;
