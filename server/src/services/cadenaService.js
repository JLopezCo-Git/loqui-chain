import { db } from '../db/connection.js';

export function saldoCaja(cadenaId) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(entrada - salida), 0) saldo
    FROM caja_movimientos
    WHERE cadena_id = ?
  `).get(cadenaId);
  return row.saldo || 0;
}

export function generarCalendario(cadenaId, fechaInicio) {
  const cadena = db.prepare('SELECT * FROM cadenas WHERE id = ?').get(cadenaId);
  if (!cadena) throw new Error('Cadena no existe');

  db.prepare('DELETE FROM quincenas WHERE cadena_id = ?').run(cadenaId);

  const insert = db.prepare(`
    INSERT INTO quincenas(cadena_id, numero_quincena, fecha_programada, fecha_limite_pago)
    VALUES (?,?,?,?)
  `);

  const base = new Date(`${fechaInicio}T00:00:00`);
  for (let i = 0; i < cadena.numero_puestos; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + (15 * i));
    const iso = d.toISOString().slice(0, 10);
    insert.run(cadenaId, i + 1, iso, iso);
  }

  db.prepare('UPDATE cadenas SET fecha_inicio = ? WHERE id = ?').run(fechaInicio, cadenaId);
}

export function validarSorteo(cadenaId) {
  const cadena = db.prepare('SELECT * FROM cadenas WHERE id = ?').get(cadenaId);
  if (!cadena) throw new Error('Cadena no existe');

  const puestos = db.prepare('SELECT * FROM puestos_cadena WHERE cadena_id = ?').all(cadenaId);
  if (!puestos.length) throw new Error('No hay sorteo registrado');

  const mapa = {};
  for (const p of puestos) {
    if (p.numero_puesto < 1 || p.numero_puesto > cadena.numero_puestos) {
      throw new Error(`Puesto fuera de rango: ${p.numero_puesto}`);
    }
    mapa[p.numero_puesto] = (mapa[p.numero_puesto] || 0) + p.fraccion;
  }

  const faltantes = [];
  for (let n = 1; n <= cadena.numero_puestos; n++) {
    if (Math.round((mapa[n] || 0) * 10000) / 10000 !== 1) faltantes.push(n);
  }
  if (faltantes.length) throw new Error(`Puestos incompletos o excedidos: ${faltantes.join(', ')}`);
  return true;
}

export function confirmarSorteo(cadenaId) {
  validarSorteo(cadenaId);

  const cadena = db.prepare('SELECT * FROM cadenas WHERE id = ?').get(cadenaId);
  let quincenas = db.prepare('SELECT * FROM quincenas WHERE cadena_id = ? ORDER BY numero_quincena').all(cadenaId);
  if (!quincenas.length) {
    if (!cadena.fecha_inicio) throw new Error('Debe generar calendario o definir fecha inicio');
    generarCalendario(cadenaId, cadena.fecha_inicio);
    quincenas = db.prepare('SELECT * FROM quincenas WHERE cadena_id = ? ORDER BY numero_quincena').all(cadenaId);
  }

  db.prepare('UPDATE puestos_cadena SET confirmado = 1 WHERE cadena_id = ?').run(cadenaId);

  const puestos = db.prepare('SELECT * FROM puestos_cadena WHERE cadena_id = ?').all(cadenaId);
  const existsOb = db.prepare('SELECT id FROM obligaciones WHERE cadena_id = ? AND quincena_id = ? LIMIT 1');
  const insertOb = db.prepare(`
    INSERT INTO obligaciones(cadena_id, quincena_id, participante_id, puesto_id, valor_esperado, saldo_pendiente, estado)
    VALUES (?,?,?,?,?,?,?)
  `);
  const insertEntrega = db.prepare(`
    INSERT INTO entregas(cadena_id, quincena_id, puesto_id, participante_id, valor_esperado, fecha_programada, estado)
    VALUES (?,?,?,?,?,?,?)
  `);

  for (const q of quincenas) {
    if (!existsOb.get(cadenaId, q.id)) {
      for (const p of puestos) {
        const valor = cadena.valor_aporte_quincenal * p.fraccion;
        insertOb.run(cadenaId, q.id, p.participante_id, p.id, valor, valor, 'PENDIENTE');
      }
      const turno = puestos.filter(p => p.numero_puesto === q.numero_quincena);
      for (const p of turno) {
        const valorEntrega = cadena.valor_aporte_quincenal * cadena.numero_puestos * p.fraccion;
        insertEntrega.run(cadenaId, q.id, p.id, p.participante_id, valorEntrega, q.fecha_programada, 'PROGRAMADA');
      }
    }
  }

  db.prepare("UPDATE cadenas SET estado = 'SORTEO_REGISTRADO' WHERE id = ?").run(cadenaId);
}

export function copiarCadena(origenId, nuevaCadenaId) {
  const participantes = db.prepare(`
    SELECT * FROM cadena_participantes
    WHERE cadena_id = ? AND activo = 1
  `).all(origenId);

  const insert = db.prepare(`
    INSERT INTO cadena_participantes(cadena_id, participante_id, cantidad_puestos, fraccion_total, activo, observaciones)
    VALUES (?,?,?,?,1,?)
  `);

  for (const p of participantes) {
    insert.run(nuevaCadenaId, p.participante_id, p.cantidad_puestos, p.fraccion_total, 'Copiado desde cadena anterior');
  }
}
