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

// El número de puestos ya no se fija al crear la cadena -- se deduce de cuántos
// puestos terminan asignados en el sorteo. Valida que cada número de puesto
// usado (1..máximo asignado, sin huecos) sume fracción exactamente 1, y
// devuelve ese máximo como el numero_puestos real de la cadena.
export function validarSorteo(cadenaId) {
  const puestos = db.prepare('SELECT * FROM puestos_cadena WHERE cadena_id = ?').all(cadenaId);
  if (!puestos.length) throw new Error('No hay sorteo registrado');

  const mapa = {};
  let maxPuesto = 0;
  for (const p of puestos) {
    if (p.numero_puesto < 1) throw new Error(`Puesto inválido: ${p.numero_puesto}`);
    mapa[p.numero_puesto] = (mapa[p.numero_puesto] || 0) + p.fraccion;
    if (p.numero_puesto > maxPuesto) maxPuesto = p.numero_puesto;
  }

  const faltantes = [];
  for (let n = 1; n <= maxPuesto; n++) {
    if (Math.round((mapa[n] || 0) * 10000) / 10000 !== 1) faltantes.push(n);
  }
  if (faltantes.length) throw new Error(`Puestos incompletos o excedidos: ${faltantes.join(', ')}`);
  return maxPuesto;
}

// Genera las obligaciones (una por quincena) y la entrega (en la quincena de su turno)
// para UN puesto ya asignado. Idempotente: no duplica si ya existen para alguna quincena.
// Se usa tanto al confirmar el sorteo completo como al agregar un jugador a una cadena
// que ya tiene calendario generado (cadena ya activa/con sorteo confirmado).
export function generarObligacionesParaPuesto(cadenaId, puesto) {
  const cadena = db.prepare('SELECT * FROM cadenas WHERE id = ?').get(cadenaId);
  const quincenas = db.prepare('SELECT * FROM quincenas WHERE cadena_id = ? ORDER BY numero_quincena').all(cadenaId);
  const existsOb = db.prepare('SELECT id FROM obligaciones WHERE cadena_id = ? AND quincena_id = ? AND puesto_id = ? LIMIT 1');
  const insertOb = db.prepare(`
    INSERT INTO obligaciones(cadena_id, quincena_id, participante_id, puesto_id, valor_esperado, saldo_pendiente, estado)
    VALUES (?,?,?,?,?,?,?)
  `);
  const existsEntrega = db.prepare('SELECT id FROM entregas WHERE cadena_id = ? AND quincena_id = ? AND puesto_id = ? LIMIT 1');
  const insertEntrega = db.prepare(`
    INSERT INTO entregas(cadena_id, quincena_id, puesto_id, participante_id, valor_esperado, fecha_programada, estado)
    VALUES (?,?,?,?,?,?,?)
  `);

  for (const q of quincenas) {
    if (!existsOb.get(cadenaId, q.id, puesto.id)) {
      const valor = cadena.valor_aporte_quincenal * puesto.fraccion;
      insertOb.run(cadenaId, q.id, puesto.participante_id, puesto.id, valor, valor, 'PENDIENTE');
    }
    if (puesto.numero_puesto === q.numero_quincena && !existsEntrega.get(cadenaId, q.id, puesto.id)) {
      const valorEntrega = cadena.valor_aporte_quincenal * cadena.numero_puestos * puesto.fraccion;
      insertEntrega.run(cadenaId, q.id, puesto.id, puesto.participante_id, valorEntrega, q.fecha_programada, 'PROGRAMADA');
    }
  }
}

// Cierra el sorteo: genera el calendario si aún no existe (usa fecha_inicio de la
// cadena), valida que los puestos sumen fracción 1, genera obligaciones/entregas
// para todos los puestos, y activa la cadena. Un solo paso -- en la práctica el
// sorteo físico, el calendario y la activación son un mismo evento.
export function cerrarSorteoYActivar(cadenaId) {
  const numeroPuestos = validarSorteo(cadenaId);

  const cadena = db.prepare('SELECT * FROM cadenas WHERE id = ?').get(cadenaId);
  db.prepare('UPDATE cadenas SET numero_puestos = ?, valor_puesto_total = ? WHERE id = ?')
    .run(numeroPuestos, cadena.valor_aporte_quincenal * numeroPuestos, cadenaId);

  let quincenas = db.prepare('SELECT * FROM quincenas WHERE cadena_id = ?').all(cadenaId);
  if (!quincenas.length) {
    if (!cadena.fecha_inicio) throw new Error('La cadena no tiene fecha de inicio definida');
    generarCalendario(cadenaId, cadena.fecha_inicio);
  }

  db.prepare('UPDATE puestos_cadena SET confirmado = 1 WHERE cadena_id = ?').run(cadenaId);

  const puestos = db.prepare('SELECT * FROM puestos_cadena WHERE cadena_id = ?').all(cadenaId);
  for (const p of puestos) generarObligacionesParaPuesto(cadenaId, p);

  db.prepare("UPDATE cadenas SET estado = 'ACTIVA' WHERE id = ?").run(cadenaId);
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
