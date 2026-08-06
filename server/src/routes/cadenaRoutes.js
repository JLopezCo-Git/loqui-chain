import express from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { audit } from '../services/auditService.js';
import { generarCalendario, confirmarSorteo, copiarCadena } from '../services/cadenaService.js';

const router = express.Router();
router.use(requireAuth, requireAdmin);

const cadenaSchema = z.object({
  nombre: z.string().min(1),
  anio: z.number().int(),
  valor_aporte_quincenal: z.number().positive(),
  numero_puestos: z.number().int().positive(),
  fecha_inicio: z.string().optional().nullable(),
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
  const puestos = origen?.numero_puestos ?? c.numero_puestos;
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

router.post('/:id/calendario', (req, res) => {
  try {
    const fecha = req.body.fecha_inicio;
    if (!fecha) return res.status(400).json({ error: 'fecha_inicio requerida' });
    generarCalendario(Number(req.params.id), fecha);
    audit({ usuarioId: req.user.id, entidad: 'cadenas', entidadId: Number(req.params.id), accion: 'GENERAR_CALENDARIO', after: { fecha_inicio: fecha } });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/:id/confirmar-sorteo', (req, res) => {
  try {
    confirmarSorteo(Number(req.params.id));
    audit({ usuarioId: req.user.id, entidad: 'cadenas', entidadId: Number(req.params.id), accion: 'CONFIRMAR_SORTEO' });
    res.json(db.prepare('SELECT * FROM cadenas WHERE id = ?').get(req.params.id));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/:id/activar', (req, res) => {
  const c = db.prepare('SELECT * FROM cadenas WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Cadena no existe' });
  if (!['SORTEO_REGISTRADO', 'ACTIVA'].includes(c.estado)) return res.status(400).json({ error: 'Debe confirmar sorteo antes de activar' });

  db.prepare("UPDATE cadenas SET estado = 'ACTIVA' WHERE id = ?").run(req.params.id);
  const after = db.prepare('SELECT * FROM cadenas WHERE id = ?').get(req.params.id);
  audit({ usuarioId: req.user.id, entidad: 'cadenas', entidadId: after.id, accion: 'ACTIVAR', before: c, after });
  res.json(after);
});

export default router;
