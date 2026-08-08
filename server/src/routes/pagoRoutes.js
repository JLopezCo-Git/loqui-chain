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
    fecha_pago: z.string().optional().nullable(),
    comprobante_url: z.string().optional().nullable(),
    observaciones: z.string().optional().nullable()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const data = parsed.data;
  const o = db.prepare('SELECT * FROM obligaciones WHERE id = ?').get(data.obligacion_id);
  if (!o) return res.status(404).json({ error: 'Obligación no existe' });

  const tx = db.transaction(() => {
    // fecha_pago es opcional -- si no se manda, la tabla usa su DEFAULT
    // CURRENT_TIMESTAMP. Permite registrar hoy un pago que ocurrió antes.
    const columnas = ['obligacion_id', 'cadena_id', 'participante_id', 'valor_pago', 'metodo_pago', 'comprobante_url', 'registrado_por', 'observaciones'];
    const valores = [o.id, o.cadena_id, o.participante_id, data.valor_pago, data.metodo_pago, data.comprobante_url || null, req.user.id, data.observaciones || null];
    if (data.fecha_pago) {
      columnas.push('fecha_pago');
      valores.push(data.fecha_pago);
    }
    const pagoResult = db
      .prepare(`INSERT INTO pagos(${columnas.join(', ')}) VALUES (${columnas.map(() => '?').join(',')})`)
      .run(...valores);

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

// Deshace el último pago registrado para una obligación (por si se marcó
// por error). Recalcula valor_pagado/saldo_pendiente/estado a partir de los
// pagos que queden (no resta a mano, para no arrastrar un error previo).
// Bloquea si ese dinero ya no está en caja (ya se usó en una entrega) --
// deshacer un pago nunca deja la caja en negativo.
router.post('/:obligacionId/deshacer', (req, res) => {
  const o = db.prepare('SELECT * FROM obligaciones WHERE id = ?').get(req.params.obligacionId);
  if (!o) return res.status(404).json({ error: 'Obligación no existe' });

  const ultimoPago = db.prepare('SELECT * FROM pagos WHERE obligacion_id = ? ORDER BY id DESC LIMIT 1').get(o.id);
  if (!ultimoPago) return res.status(400).json({ error: 'No hay pagos registrados para deshacer' });

  const disponible = saldoCaja(o.cadena_id);
  if (ultimoPago.valor_pago > disponible) {
    return res
      .status(400)
      .json({ error: `No se puede deshacer: ese dinero ya se usó (caja disponible ${disponible}, el pago era de ${ultimoPago.valor_pago})` });
  }

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM pagos WHERE id = ?').run(ultimoPago.id);
    db.prepare("DELETE FROM caja_movimientos WHERE origen = 'PAGO' AND origen_id = ?").run(ultimoPago.id);

    const restante = db.prepare('SELECT COALESCE(SUM(valor_pago),0) n FROM pagos WHERE obligacion_id = ?').get(o.id).n;
    const saldo = Math.max(o.valor_esperado - restante, 0);
    const estado = restante === 0 ? 'PENDIENTE' : saldo === 0 ? 'PAGADA' : 'PARCIAL';
    db.prepare('UPDATE obligaciones SET valor_pagado = ?, saldo_pendiente = ?, estado = ? WHERE id = ?').run(restante, saldo, estado, o.id);
  });
  tx();

  audit({ usuarioId: req.user.id, entidad: 'pagos', entidadId: ultimoPago.id, accion: 'DESHACER', before: ultimoPago });
  res.json(db.prepare('SELECT * FROM obligaciones WHERE id = ?').get(o.id));
});

export default router;
