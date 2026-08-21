import express from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { audit } from '../services/auditService.js';

const router = express.Router();
router.use(requireAuth, requireAdmin);

function conDetalle(conteo) {
  return { ...conteo, detalle: JSON.parse(conteo.detalle) };
}

router.get('/', (req, res) => {
  const conteos = db.prepare('SELECT * FROM conteos_monedas ORDER BY fecha DESC, id DESC').all();
  res.json(conteos.map(conDetalle));
});

const monedaSchema = z.object({
  valor: z.number().positive(),
  porGrupo: z.number().int().min(0),
  grupos: z.number().int().min(0),
});

const billeteSchema = z.object({
  valor: z.number().positive(),
  cantidad: z.number().int().min(0),
});

const conteoSchema = z.object({
  monedas: z.array(monedaSchema),
  billetes: z.array(billeteSchema),
  observaciones: z.string().optional().nullable(),
});

router.post('/', (req, res) => {
  const parsed = conteoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { monedas, billetes, observaciones } = parsed.data;

  // El servidor recalcula todos los subtotales -- nunca confía en las cuentas
  // que venga del cliente, aunque acá el "esperado" no depende de otra tabla,
  // es puramente aritmética sobre lo que el usuario contó.
  const monedasDetalle = monedas.map((m) => {
    const monedasTotales = m.porGrupo * m.grupos;
    return { ...m, monedasTotales, valorPorGrupo: m.valor * m.porGrupo, subtotal: m.valor * monedasTotales };
  });
  const billetesDetalle = billetes.map((b) => ({ ...b, subtotal: b.valor * b.cantidad }));

  const totalMonedas = monedasDetalle.reduce((s, m) => s + m.subtotal, 0);
  const totalBilletes = billetesDetalle.reduce((s, b) => s + b.subtotal, 0);
  const totalGeneral = totalMonedas + totalBilletes;

  const result = db
    .prepare(
      `INSERT INTO conteos_monedas(total_monedas, total_billetes, total_general, detalle, observaciones, registrado_por)
       VALUES (?,?,?,?,?,?)`,
    )
    .run(
      totalMonedas,
      totalBilletes,
      totalGeneral,
      JSON.stringify({ monedas: monedasDetalle, billetes: billetesDetalle }),
      observaciones || null,
      req.user.id,
    );

  const conteo = conDetalle(db.prepare('SELECT * FROM conteos_monedas WHERE id = ?').get(result.lastInsertRowid));
  audit({ usuarioId: req.user.id, entidad: 'conteos_monedas', entidadId: conteo.id, accion: 'CREAR', after: conteo });
  res.status(201).json(conteo);
});

router.delete('/:id', (req, res) => {
  const existente = db.prepare('SELECT * FROM conteos_monedas WHERE id = ?').get(req.params.id);
  if (!existente) return res.status(404).json({ error: 'Conteo no existe' });

  db.prepare('DELETE FROM conteos_monedas WHERE id = ?').run(req.params.id);
  audit({ usuarioId: req.user.id, entidad: 'conteos_monedas', entidadId: Number(req.params.id), accion: 'ELIMINAR', before: existente });
  res.status(204).end();
});

export default router;
