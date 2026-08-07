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

// Lo que exige atención ahora mismo en una cadena: cuotas vencidas (fecha
// límite ya pasada y no pagadas), la próxima entrega programada, y si el
// último arqueo de caja quedó con faltante. Pensado para el bloque
// "Atención requerida" del dashboard -- no para navegar, solo para decidir.
router.get('/cadena/:cadenaId/atencion', (req, res) => {
  const cadenaId = Number(req.params.cadenaId);
  const cadena = db.prepare('SELECT * FROM cadenas WHERE id = ?').get(cadenaId);
  if (!cadena) return res.status(404).json({ error: 'Cadena no existe' });

  const hoy = new Date().toISOString().slice(0, 10);

  const vencidas = db.prepare(`
    SELECT o.*, p.nombre participante, q.numero_quincena, q.fecha_limite_pago
    FROM obligaciones o
    JOIN participantes p ON p.id = o.participante_id
    JOIN quincenas q ON q.id = o.quincena_id
    WHERE o.cadena_id = ? AND o.estado <> 'PAGADA' AND q.fecha_limite_pago < ?
    ORDER BY q.fecha_limite_pago
  `).all(cadenaId, hoy);

  const proximaEntrega = db.prepare(`
    SELECT e.*, p.nombre participante
    FROM entregas e
    JOIN participantes p ON p.id = e.participante_id
    WHERE e.cadena_id = ? AND e.estado <> 'ENTREGADA'
    ORDER BY e.fecha_programada
    LIMIT 1
  `).get(cadenaId) || null;

  const ultimoArqueo = db.prepare('SELECT * FROM arqueos_caja WHERE cadena_id = ? ORDER BY fecha DESC, id DESC LIMIT 1').get(cadenaId);
  let arqueoFaltante = null;
  if (ultimoArqueo) {
    const otrasFuentes = db.prepare('SELECT COALESCE(SUM(monto),0) n FROM arqueo_items WHERE arqueo_id = ?').get(ultimoArqueo.id).n;
    const falta = ultimoArqueo.esperado - ultimoArqueo.efectivo_contado - otrasFuentes;
    if (falta > 0) arqueoFaltante = falta;
  }

  res.json({ vencidas, proximaEntrega, arqueoFaltante });
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
