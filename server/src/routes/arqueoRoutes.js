import express from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { audit } from '../services/auditService.js';

const router = express.Router();
router.use(requireAuth, requireAdmin);

// Cuánto debería haber en caja según lo ya pagado por los participantes
// (no lo que hay físicamente -- eso es lo que se está arqueando).
function esperadoCadena(cadenaId) {
  return db.prepare('SELECT COALESCE(SUM(valor_pagado),0) n FROM obligaciones WHERE cadena_id = ?').get(cadenaId).n;
}

function conItems(arqueo) {
  const items = db.prepare('SELECT id, etiqueta, monto FROM arqueo_items WHERE arqueo_id = ? ORDER BY id').all(arqueo.id);
  const otrasFuentes = items.reduce((sum, i) => sum + i.monto, 0);
  return {
    ...arqueo,
    denominaciones: arqueo.denominaciones ? JSON.parse(arqueo.denominaciones) : null,
    items,
    faltaReponer: arqueo.esperado - arqueo.efectivo_contado - otrasFuentes,
  };
}

router.get('/cadena/:cadenaId', (req, res) => {
  const arqueos = db
    .prepare('SELECT * FROM arqueos_caja WHERE cadena_id = ? ORDER BY fecha DESC, id DESC')
    .all(req.params.cadenaId);
  res.json(arqueos.map(conItems));
});

router.get('/cadena/:cadenaId/esperado', (req, res) => {
  res.json({ esperado: esperadoCadena(req.params.cadenaId) });
});

const arqueoSchema = z.object({
  cadena_id: z.number().int(),
  efectivo_contado: z.number().min(0),
  denominaciones: z.array(z.object({ valor: z.number().positive(), cantidad: z.number().int().min(0) })).optional(),
  observaciones: z.string().optional().nullable(),
  items: z.array(z.object({ etiqueta: z.string().min(1), monto: z.number() })).optional(),
});

router.post('/', (req, res) => {
  const parsed = arqueoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const a = parsed.data;
  const cadena = db.prepare('SELECT * FROM cadenas WHERE id = ?').get(a.cadena_id);
  if (!cadena) return res.status(404).json({ error: 'Cadena no existe' });

  const esperado = esperadoCadena(a.cadena_id);

  const tx = db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO arqueos_caja(cadena_id, esperado, efectivo_contado, denominaciones, observaciones, registrado_por)
         VALUES (?,?,?,?,?,?)`,
      )
      .run(
        a.cadena_id,
        esperado,
        a.efectivo_contado,
        a.denominaciones ? JSON.stringify(a.denominaciones) : null,
        a.observaciones || null,
        req.user.id,
      );

    const insertItem = db.prepare('INSERT INTO arqueo_items(arqueo_id, etiqueta, monto) VALUES (?,?,?)');
    for (const item of a.items || []) insertItem.run(result.lastInsertRowid, item.etiqueta, item.monto);

    return result.lastInsertRowid;
  });

  const id = tx();
  const item = conItems(db.prepare('SELECT * FROM arqueos_caja WHERE id = ?').get(id));
  audit({ usuarioId: req.user.id, entidad: 'arqueos_caja', entidadId: item.id, accion: 'CREAR', after: item });
  res.status(201).json(item);
});

router.delete('/:id', (req, res) => {
  const existente = db.prepare('SELECT * FROM arqueos_caja WHERE id = ?').get(req.params.id);
  if (!existente) return res.status(404).json({ error: 'Arqueo no existe' });

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM arqueo_items WHERE arqueo_id = ?').run(req.params.id);
    db.prepare('DELETE FROM arqueos_caja WHERE id = ?').run(req.params.id);
  });
  tx();

  audit({ usuarioId: req.user.id, entidad: 'arqueos_caja', entidadId: Number(req.params.id), accion: 'ELIMINAR', before: existente });
  res.status(204).end();
});

export default router;
