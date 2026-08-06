import express from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { saldoCaja } from '../services/cadenaService.js';

const router = express.Router();
router.use(requireAuth, requireAdmin);

router.post('/consultar', (req, res) => {
  const schema = z.object({ cadena_id: z.number().int(), pregunta: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { cadena_id, pregunta } = parsed.data;
  const cadena = db.prepare('SELECT * FROM cadenas WHERE id = ?').get(cadena_id);
  if (!cadena) return res.status(404).json({ error: 'Cadena no existe' });

  const pendiente = db.prepare("SELECT COALESCE(SUM(saldo_pendiente),0) n FROM obligaciones WHERE cadena_id=? AND estado <> 'PAGADA'").get(cadena_id).n;
  const pagado = db.prepare("SELECT COALESCE(SUM(valor_pagado),0) n FROM obligaciones WHERE cadena_id=?").get(cadena_id).n;
  const entregado = db.prepare("SELECT COALESCE(SUM(valor_entregado),0) n FROM entregas WHERE cadena_id=?").get(cadena_id).n;
  const caja = saldoCaja(cadena_id);
  const q = pregunta.toLowerCase();

  if (q.includes('mora') || q.includes('deben') || q.includes('pendiente')) {
    return res.json({ respuesta: `La cadena ${cadena.nombre} tiene pendiente $${pendiente.toLocaleString('es-CO')}.` });
  }
  if (q.includes('caja') || q.includes('cuadra')) {
    return res.json({ respuesta: `Caja: $${caja.toLocaleString('es-CO')}. Pagado: $${pagado.toLocaleString('es-CO')}. Entregado: $${entregado.toLocaleString('es-CO')}.` });
  }
  if (q.includes('entrega')) {
    const e = db.prepare("SELECT * FROM entregas WHERE cadena_id=? AND estado <> 'ENTREGADA' ORDER BY fecha_programada LIMIT 1").get(cadena_id);
    if (!e) return res.json({ respuesta: 'No hay entregas pendientes.' });
    return res.json({ respuesta: `Próxima entrega: ${e.fecha_programada}. Valor esperado: $${e.valor_esperado.toLocaleString('es-CO')}. Caja disponible: $${caja.toLocaleString('es-CO')}.` });
  }

  res.json({ respuesta: `Resumen ${cadena.nombre}: estado ${cadena.estado}, caja $${caja.toLocaleString('es-CO')}, pendiente $${pendiente.toLocaleString('es-CO')}.` });
});

export default router;
