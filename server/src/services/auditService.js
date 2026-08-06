import { db } from '../db/connection.js';

export function audit({ usuarioId, entidad, entidadId, accion, before = null, after = null, motivo = null }) {
  db.prepare(`
    INSERT INTO auditoria(usuario_id, entidad, entidad_id, accion, valor_anterior, valor_nuevo, motivo)
    VALUES (?,?,?,?,?,?,?)
  `).run(
    usuarioId || null,
    entidad,
    entidadId || null,
    accion,
    before ? JSON.stringify(before) : null,
    after ? JSON.stringify(after) : null,
    motivo
  );
}
