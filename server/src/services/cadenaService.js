import { db } from '../db/connection.js';

export function saldoCaja(cadenaId) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(entrada - salida), 0) saldo
    FROM caja_movimientos
    WHERE cadena_id = ?
  `).get(cadenaId);
  return row.saldo || 0;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function ultimoDiaMes(year, month) {
  return new Date(year, month, 0).getDate(); // día 0 del mes siguiente = último día de este mes
}

// Genera N fechas ancladas al calendario real: siempre 15 o "30" (el 30, o el
// último día del mes si tiene menos de 30 -- ej. febrero) de cada mes.
// Nunca "cada 15 días corridos" desde fechaInicio, porque eso se desalinea
// del calendario apenas un mes tiene más de 30 días (marzo, mayo, etc.).
export function generarFechasQuincenales(fechaInicio, cantidad) {
  let [year, month, dia] = fechaInicio.split('-').map(Number);
  let esQuince = dia <= 15;
  const fechas = [];
  for (let i = 0; i < cantidad; i++) {
    const diaFecha = esQuince ? 15 : Math.min(30, ultimoDiaMes(year, month));
    fechas.push(`${year}-${pad(month)}-${pad(diaFecha)}`);
    if (esQuince) {
      esQuince = false;
    } else {
      esQuince = true;
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }
  }
  return fechas;
}

export function generarCalendario(cadenaId, fechaInicio) {
  const cadena = db.prepare('SELECT * FROM cadenas WHERE id = ?').get(cadenaId);
  if (!cadena) throw new Error('Cadena no existe');

  db.prepare('DELETE FROM quincenas WHERE cadena_id = ?').run(cadenaId);

  const insert = db.prepare(`
    INSERT INTO quincenas(cadena_id, numero_quincena, fecha_programada, fecha_limite_pago)
    VALUES (?,?,?,?)
  `);

  const fechas = generarFechasQuincenales(fechaInicio, cadena.numero_puestos);
  fechas.forEach((iso, i) => insert.run(cadenaId, i + 1, iso, iso));

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

// Marca una quincena completa como resuelta en un solo paso: paga el saldo
// pendiente de TODAS las obligaciones de esa quincena y entrega TODO lo
// programado para ese ciclo, todo en una sola transacción (o nada, si algo
// falla -- ej. caja insuficiente para la entrega). Pensado para el caso real
// de "ya sé que todos pagaron y ya se entregó, no quiero marcar uno por uno".
export function cerrarQuincena(cadenaId, quincenaId, usuarioId) {
  const quincena = db.prepare('SELECT * FROM quincenas WHERE id = ? AND cadena_id = ?').get(quincenaId, cadenaId);
  if (!quincena) throw new Error('Quincena no existe');

  const tx = db.transaction(() => {
    const obligaciones = db
      .prepare("SELECT * FROM obligaciones WHERE cadena_id = ? AND quincena_id = ? AND estado <> 'PAGADA'")
      .all(cadenaId, quincenaId);

    const insertPago = db.prepare(`
      INSERT INTO pagos(obligacion_id, cadena_id, participante_id, valor_pago, metodo_pago, registrado_por, observaciones)
      VALUES (?,?,?,?,?,?,?)
    `);
    const actualizarObligacion = db.prepare(
      "UPDATE obligaciones SET valor_pagado = valor_esperado, saldo_pendiente = 0, estado = 'PAGADA' WHERE id = ?",
    );
    const insertMovimiento = db.prepare(`
      INSERT INTO caja_movimientos(cadena_id, tipo, origen, origen_id, entrada, salida, saldo_resultante, registrado_por)
      VALUES (?,?,?,?,?,?,?,?)
    `);

    for (const o of obligaciones) {
      if (o.saldo_pendiente <= 0) continue;
      const pago = insertPago.run(o.id, cadenaId, o.participante_id, o.saldo_pendiente, 'Efectivo', usuarioId, 'Cierre de quincena (todos)');
      actualizarObligacion.run(o.id);
      const saldoNuevo = saldoCaja(cadenaId) + o.saldo_pendiente;
      insertMovimiento.run(cadenaId, 'ENTRADA', 'PAGO', pago.lastInsertRowid, o.saldo_pendiente, 0, saldoNuevo, usuarioId);
    }

    const entregas = db
      .prepare("SELECT * FROM entregas WHERE cadena_id = ? AND quincena_id = ? AND estado <> 'ENTREGADA'")
      .all(cadenaId, quincenaId);

    for (const e of entregas) {
      const pendiente = e.valor_esperado - e.valor_entregado;
      if (pendiente <= 0) continue;
      const disponible = saldoCaja(cadenaId);
      if (pendiente > disponible) {
        throw new Error(`Caja insuficiente para entregar todo lo de esta quincena. Disponible: ${disponible}, falta entregar: ${pendiente}`);
      }
      db.prepare(
        "UPDATE entregas SET valor_entregado = valor_esperado, fecha_entrega = CURRENT_TIMESTAMP, estado = 'ENTREGADA' WHERE id = ?",
      ).run(e.id);
      const saldoNuevo = disponible - pendiente;
      insertMovimiento.run(cadenaId, 'SALIDA', 'ENTREGA', e.id, 0, pendiente, saldoNuevo, usuarioId);
    }

    db.prepare("UPDATE quincenas SET estado = 'CERRADA' WHERE id = ?").run(quincenaId);
  });

  tx();
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
