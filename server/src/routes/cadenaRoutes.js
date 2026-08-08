import express from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { audit } from '../services/auditService.js';
import { cerrarSorteoYActivar, cerrarQuincena, copiarCadena } from '../services/cadenaService.js';

const router = express.Router();
router.use(requireAuth, requireAdmin);

const cadenaSchema = z.object({
  nombre: z.string().min(1),
  anio: z.number().int(),
  valor_aporte_quincenal: z.number().positive(),
  // No se pide al crear: se deduce de cuántos puestos terminan asignados en
  // el sorteo (cerrarSorteoYActivar la fija). Editable a mano si hace falta.
  numero_puestos: z.number().int().min(0).optional(),
  fecha_inicio: z.string().min(1),
  fecha_fin: z.string().optional().nullable(),
  cadena_origen_id: z.number().int().optional().nullable()
});

router.get('/', (req, res) => {
  const data = db.prepare('SELECT * FROM cadenas ORDER BY id DESC').all();
  res.json(data);
});

router.post('/', (req, res) => {
  const parsed = cadenaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const c = parsed.data;
  let origen = null;
  if (c.cadena_origen_id) {
    origen = db.prepare('SELECT * FROM cadenas WHERE id = ?').get(c.cadena_origen_id);
    if (!origen) return res.status(404).json({ error: 'Cadena origen no existe' });
  }

  const valor = origen?.valor_aporte_quincenal ?? c.valor_aporte_quincenal;
  // numero_puestos nunca se hereda del origen -- se deduce del sorteo de ESTA
  // cadena (puede terminar con más o menos jugadores que la anterior).
  const puestos = c.numero_puestos ?? 0;
  const total = valor * puestos;

  const result = db.prepare(`
    INSERT INTO cadenas(nombre, anio, estado, valor_aporte_quincenal, numero_puestos, valor_puesto_total, cadena_origen_id, fecha_inicio, fecha_fin, creada_por)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(c.nombre, c.anio, 'PENDIENTE_SORTEO', valor, puestos, total, c.cadena_origen_id || null, c.fecha_inicio || null, c.fecha_fin || null, req.user.id);

  if (c.cadena_origen_id) copiarCadena(c.cadena_origen_id, result.lastInsertRowid);

  const nueva = db.prepare('SELECT * FROM cadenas WHERE id = ?').get(result.lastInsertRowid);
  audit({ usuarioId: req.user.id, entidad: 'cadenas', entidadId: nueva.id, accion: 'CREAR', after: nueva });
  res.status(201).json(nueva);
});

router.get('/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM cadenas WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Cadena no existe' });
  res.json(c);
});

router.post('/:id/cerrar-sorteo', (req, res) => {
  try {
    cerrarSorteoYActivar(Number(req.params.id));
    audit({ usuarioId: req.user.id, entidad: 'cadenas', entidadId: Number(req.params.id), accion: 'CERRAR_SORTEO_Y_ACTIVAR' });
    res.json(db.prepare('SELECT * FROM cadenas WHERE id = ?').get(req.params.id));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Cierra una quincena completa en un solo paso: paga todo lo pendiente de esa
// quincena y entrega todo lo programado para ese ciclo, en una transacción.
router.post('/:id/quincenas/:quincenaId/cerrar', (req, res) => {
  try {
    cerrarQuincena(Number(req.params.id), Number(req.params.quincenaId), req.user.id);
    audit({ usuarioId: req.user.id, entidad: 'quincenas', entidadId: Number(req.params.quincenaId), accion: 'CERRAR_QUINCENA' });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Editar cadena en cualquier estado. Si cambia valor_aporte_quincenal o
// numero_puestos en una cadena ya ACTIVA, las obligaciones/entregas ya
// generadas NO se recalculan -- puede descuadrar montos ya calculados,
// es responsabilidad de quien edita revisarlo (ver docs/ARCHITECTURE.md).
router.patch('/:id', (req, res) => {
  const existente = db.prepare('SELECT * FROM cadenas WHERE id = ?').get(req.params.id);
  if (!existente) return res.status(404).json({ error: 'Cadena no existe' });

  const parsed = cadenaSchema.omit({ cadena_origen_id: true }).partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const c = { ...existente, ...parsed.data };
  const valor_puesto_total = c.valor_aporte_quincenal * c.numero_puestos;

  db.prepare(`
    UPDATE cadenas
    SET nombre = ?, anio = ?, valor_aporte_quincenal = ?, numero_puestos = ?, valor_puesto_total = ?, fecha_inicio = ?, fecha_fin = ?
    WHERE id = ?
  `).run(c.nombre, c.anio, c.valor_aporte_quincenal, c.numero_puestos, valor_puesto_total, c.fecha_inicio || null, c.fecha_fin || null, req.params.id);

  const after = db.prepare('SELECT * FROM cadenas WHERE id = ?').get(req.params.id);
  audit({ usuarioId: req.user.id, entidad: 'cadenas', entidadId: after.id, accion: 'EDITAR', before: existente, after });
  res.json(after);
});

// Elimina la cadena y todo lo asociado (jugadores vinculados, puestos,
// calendario, obligaciones, pagos, entregas, movimientos de caja, arqueos).
router.delete('/:id', (req, res) => {
  const existente = db.prepare('SELECT * FROM cadenas WHERE id = ?').get(req.params.id);
  if (!existente) return res.status(404).json({ error: 'Cadena no existe' });

  const tx = db.transaction(() => {
    const arqueoIds = db.prepare('SELECT id FROM arqueos_caja WHERE cadena_id = ?').all(req.params.id).map((r) => r.id);
    const deleteItems = db.prepare('DELETE FROM arqueo_items WHERE arqueo_id = ?');
    for (const id of arqueoIds) deleteItems.run(id);
    db.prepare('DELETE FROM arqueos_caja WHERE cadena_id = ?').run(req.params.id);
    db.prepare('DELETE FROM caja_movimientos WHERE cadena_id = ?').run(req.params.id);
    db.prepare('DELETE FROM pagos WHERE cadena_id = ?').run(req.params.id);
    db.prepare('DELETE FROM obligaciones WHERE cadena_id = ?').run(req.params.id);
    db.prepare('DELETE FROM entregas WHERE cadena_id = ?').run(req.params.id);
    db.prepare('DELETE FROM quincenas WHERE cadena_id = ?').run(req.params.id);
    db.prepare('DELETE FROM puestos_cadena WHERE cadena_id = ?').run(req.params.id);
    db.prepare('DELETE FROM cadena_participantes WHERE cadena_id = ?').run(req.params.id);
    // Cadenas clonadas desde esta no deben quedar con una referencia rota.
    db.prepare('UPDATE cadenas SET cadena_origen_id = NULL WHERE cadena_origen_id = ?').run(req.params.id);
    db.prepare('DELETE FROM cadenas WHERE id = ?').run(req.params.id);
  });
  tx();

  audit({ usuarioId: req.user.id, entidad: 'cadenas', entidadId: Number(req.params.id), accion: 'ELIMINAR', before: existente });
  res.status(204).end();
});

export default router;
