import express from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { audit } from '../services/auditService.js';
import { saldoCaja } from '../services/cadenaService.js';

const router = express.Router();
router.use(requireAuth, requireAdmin);

router.get('/:cadenaId', (req, res) => {
  res.json(db.prepare(`
    SELECT e.*, p.nombre participante, q.numero_quincena
    FROM entregas e
    JOIN participantes p ON p.id = e.participante_id
    JOIN quincenas q ON q.id = e.quincena_id
    WHERE e.cadena_id = ?
    ORDER BY e.fecha_programada
  `).all(req.params.cadenaId));
});

router.post('/registrar', (req, res) => {
  const schema = z.object({
    entrega_id: z.number().int(),
    valor_entregado: z.number().positive(),
    comprobante_url: z.string().optional().nullable(),
    observaciones: z.string().optional().nullable()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const data = parsed.data;
  const e = db.prepare('SELECT * FROM entregas WHERE id = ?').get(data.entrega_id);
  if (!e) return res.status(404).json({ error: 'Entrega no existe' });

  const disponible = saldoCaja(e.cadena_id);
  if (data.valor_entregado > disponible) return res.status(400).json({ error: `Caja insuficiente. Disponible: ${disponible}` });

  const tx = db.transaction(() => {
    const nuevoEntregado = e.valor_entregado + data.valor_entregado;
    const estado = nuevoEntregado >= e.valor_esperado ? 'ENTREGADA' : 'ENTREGADA_PARCIAL';

    db.prepare(`
      UPDATE entregas
      SET valor_entregado = ?, fecha_entrega = CURRENT_TIMESTAMP, estado = ?, comprobante_url = ?, observaciones = ?
      WHERE id = ?
    `).run(nuevoEntregado, estado, data.comprobante_url || null, data.observaciones || null, e.id);

    const saldoNuevo = disponible - data.valor_entregado;
    db.prepare(`
      INSERT INTO caja_movimientos(cadena_id, tipo, origen, origen_id, salida, saldo_resultante, registrado_por)
      VALUES (?, 'SALIDA', 'ENTREGA', ?, ?, ?, ?)
    `).run(e.cadena_id, e.id, data.valor_entregado, saldoNuevo, req.user.id);

    const after = db.prepare('SELECT * FROM entregas WHERE id = ?').get(e.id);
    audit({ usuarioId: req.user.id, entidad: 'entregas', entidadId: e.id, accion: 'REGISTRAR_ENTREGA', before: e, after });
    return after;
  });

  res.json(tx());
});

export default router;
