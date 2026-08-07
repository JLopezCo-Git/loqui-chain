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

// Vista tipo grilla (participante x quincena) para ver de un vistazo cómo va
// la cadena -- equivalente a la hoja de cálculo con la que se lleva hoy.
router.get('/cadena/:cadenaId/grilla', (req, res) => {
  const cadenaId = Number(req.params.cadenaId);
  const cadena = db.prepare('SELECT * FROM cadenas WHERE id = ?').get(cadenaId);
  if (!cadena) return res.status(404).json({ error: 'Cadena no existe' });

  const quincenas = db.prepare('SELECT * FROM quincenas WHERE cadena_id = ? ORDER BY numero_quincena').all(cadenaId);
  const puestos = db.prepare(`
    SELECT pc.*, p.nombre participante
    FROM puestos_cadena pc
    JOIN participantes p ON p.id = pc.participante_id
    WHERE pc.cadena_id = ?
    ORDER BY pc.numero_puesto, pc.fraccion DESC
  `).all(cadenaId);

  const obligaciones = db.prepare('SELECT * FROM obligaciones WHERE cadena_id = ?').all(cadenaId);
  const obligacionesPorPuesto = new Map();
  for (const o of obligaciones) {
    if (!obligacionesPorPuesto.has(o.puesto_id)) obligacionesPorPuesto.set(o.puesto_id, new Map());
    obligacionesPorPuesto.get(o.puesto_id).set(o.quincena_id, o);
  }

  const entregas = db.prepare('SELECT * FROM entregas WHERE cadena_id = ?').all(cadenaId);
  const entregaPorPuesto = new Map(entregas.map((e) => [e.puesto_id, e]));

  const filas = puestos.map((puesto) => ({
    puesto_id: puesto.id,
    numero_puesto: puesto.numero_puesto,
    fraccion: puesto.fraccion,
    participante_id: puesto.participante_id,
    participante: puesto.participante,
    celdas: quincenas.map((q) => obligacionesPorPuesto.get(puesto.id)?.get(q.id) || null),
    entrega: entregaPorPuesto.get(puesto.id) || null
  }));

  res.json({ cadena, quincenas, filas, caja: saldoCaja(cadenaId) });
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
