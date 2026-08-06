import express from 'express';
import { db } from '../db/connection.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { saldoCaja } from '../services/cadenaService.js';

const router = express.Router();
router.use(requireAuth, requireAdmin);

router.get('/dashboard', (req, res) => {
  const cadenasTotal = db.prepare('SELECT COUNT(*) n FROM cadenas').get().n;
  const cadenasActivas = db.prepare("SELECT COUNT(*) n FROM cadenas WHERE estado = 'ACTIVA'").get().n;
  const cajaGlobal = db.prepare('SELECT COALESCE(SUM(entrada - salida), 0) n FROM caja_movimientos').get().n;
  const pendienteGlobal = db.prepare("SELECT COALESCE(SUM(saldo_pendiente), 0) n FROM obligaciones WHERE estado <> 'PAGADA'").get().n;
  const entregasPendientes = db.prepare("SELECT COUNT(*) n FROM entregas WHERE estado <> 'ENTREGADA'").get().n;
  res.json({ cadenasTotal, cadenasActivas, cajaGlobal, pendienteGlobal, entregasPendientes });
});

router.get('/cadena/:cadenaId', (req, res) => {
  const cadenaId = Number(req.params.cadenaId);
  const resumen = {
    caja: saldoCaja(cadenaId),
    esperado: db.prepare('SELECT COALESCE(SUM(valor_esperado),0) n FROM obligaciones WHERE cadena_id=?').get(cadenaId).n,
    pagado: db.prepare('SELECT COALESCE(SUM(valor_pagado),0) n FROM obligaciones WHERE cadena_id=?').get(cadenaId).n,
    pendiente: db.prepare("SELECT COALESCE(SUM(saldo_pendiente),0) n FROM obligaciones WHERE cadena_id=? AND estado <> 'PAGADA'").get(cadenaId).n,
    entregado: db.prepare('SELECT COALESCE(SUM(valor_entregado),0) n FROM entregas WHERE cadena_id=?').get(cadenaId).n
  };
  res.json(resumen);
});

export default router;
