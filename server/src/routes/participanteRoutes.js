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

router.patch('/:id', (req, res) => {
  const existente = db.prepare('SELECT * FROM participantes WHERE id = ?').get(req.params.id);
  if (!existente) return res.status(404).json({ error: 'Participante no existe' });

  const parsed = participanteSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const p = { ...existente, ...parsed.data };
  db.prepare('UPDATE participantes SET nombre = ?, celular = ?, observaciones = ? WHERE id = ?')
    .run(p.nombre, p.celular || null, p.observaciones || null, req.params.id);

  const item = db
    .prepare('SELECT id, nombre, celular, estado, observaciones, creado_en FROM participantes WHERE id = ?')
    .get(req.params.id);
  audit({ usuarioId: req.user.id, entidad: 'participantes', entidadId: item.id, accion: 'EDITAR', before: existente, after: item });
  res.json(item);
});

router.delete('/:id', (req, res) => {
  const existente = db.prepare('SELECT * FROM participantes WHERE id = ?').get(req.params.id);
  if (!existente) return res.status(404).json({ error: 'Participante no existe' });

  const vinculos = db.prepare('SELECT COUNT(*) n FROM cadena_participantes WHERE participante_id = ?').get(req.params.id).n;
  if (vinculos > 0) {
    return res.status(409).json({ error: 'No se puede eliminar: el participante ya está vinculado a alguna cadena' });
  }

  db.prepare('DELETE FROM participantes WHERE id = ?').run(req.params.id);
  audit({ usuarioId: req.user.id, entidad: 'participantes', entidadId: Number(req.params.id), accion: 'ELIMINAR', before: existente });
  res.status(204).end();
});

// Quitar un jugador de una cadena que todavía está armando lista (antes de cerrar sorteo).
// También limpia cualquier puesto que ya se le hubiera asignado en esa cadena.
router.delete('/vincular/:cadenaId/:participanteId', (req, res) => {
  const { cadenaId, participanteId } = req.params;
  const cadena = db.prepare('SELECT * FROM cadenas WHERE id = ?').get(cadenaId);
  if (!cadena) return res.status(404).json({ error: 'Cadena no existe' });
  if (cadena.estado !== 'PENDIENTE_SORTEO') {
    return res.status(400).json({ error: 'Solo se puede quitar un jugador mientras la cadena está armando lista (antes de cerrar sorteo)' });
  }

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM puestos_cadena WHERE cadena_id = ? AND participante_id = ?').run(cadenaId, participanteId);
    db.prepare('DELETE FROM cadena_participantes WHERE cadena_id = ? AND participante_id = ?').run(cadenaId, participanteId);
  });
  tx();

  audit({
    usuarioId: req.user.id,
    entidad: 'cadena_participantes',
    entidadId: Number(participanteId),
    accion: 'QUITAR_DE_CADENA',
    before: { cadena_id: Number(cadenaId), participante_id: Number(participanteId) }
  });
  res.status(204).end();
});

export default router;
