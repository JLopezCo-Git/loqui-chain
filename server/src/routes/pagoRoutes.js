import express from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { audit } from '../services/auditService.js';
import { saldoCaja } from '../services/cadenaService.js';

const router = express.Router();
router.use(requireAuth, requireAdmin);

router.get('/pendientes/:cadenaId', (req, res) => {
  res.json(db.prepare(`
    SELECT o.*, p.nombre participante, q.numero_quincena
    FROM obligaciones o
    JOIN participantes p ON p.id = o.participante_id
    JOIN quincenas q ON q.id = o.quincena_id
    WHERE o.cadena_id = ? AND o.estado <> 'PAGADA'
    ORDER BY q.numero_quincena, p.nombre
  `).all(req.params.cadenaId));
});

router.post('/', (req, res) => {
  const schema = z.object({
    obligacion_id: z.number().int(),
    valor_pago: z.number().positive(),
    metodo_pago: z.string().min(1),
    comprobante_url: z.string().optional().nullable(),
    observaciones: z.string().optional().nullable()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const data = parsed.data;
  const o = db.prepare('SELECT * FROM obligaciones WHERE id = ?').get(data.obligacion_id);
  if (!o) return res.status(404).json({ error: 'Obligación no existe' });

  const tx = db.transaction(() => {
    const pagoResult = db.prepare(`
      INSERT INTO pagos(obligacion_id, cadena_id, participante_id, valor_pago, metodo_pago, comprobante_url, registrado_por, observaciones)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(o.id, o.cadena_id, o.participante_id, data.valor_pago, data.metodo_pago, data.comprobante_url || null, req.user.id, data.observaciones || null);

    const nuevoPagado = o.valor_pagado + data.valor_pago;
    const saldo = Math.max(o.valor_esperado - nuevoPagado, 0);
    const estado = saldo === 0 ? 'PAGADA' : 'PARCIAL';

    db.prepare('UPDATE obligaciones SET valor_pagado = ?, saldo_pendiente = ?, estado = ? WHERE id = ?')
      .run(nuevoPagado, saldo, estado, o.id);

    const saldoNuevo = saldoCaja(o.cadena_id) + data.valor_pago;
    db.prepare(`
      INSERT INTO caja_movimientos(cadena_id, tipo, origen, origen_id, entrada, saldo_resultante, registrado_por)
      VALUES (?, 'ENTRADA', 'PAGO', ?, ?, ?, ?)
    `).run(o.cadena_id, pagoResult.lastInsertRowid, data.valor_pago, saldoNuevo, req.user.id);

    const pago = db.prepare('SELECT * FROM pagos WHERE id = ?').get(pagoResult.lastInsertRowid);
    audit({ usuarioId: req.user.id, entidad: 'pagos', entidadId: pago.id, accion: 'REGISTRAR', after: pago });
    return pago;
  });

  res.status(201).json(tx());
});

export default router;
