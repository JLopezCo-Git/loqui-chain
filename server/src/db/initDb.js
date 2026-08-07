import bcrypt from 'bcryptjs';
import { db } from './connection.js';

db.exec(`
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('ADMIN_PRINCIPAL','ADMIN_SECUNDARIO','PARTICIPANTE')),
  activo INTEGER NOT NULL DEFAULT 1,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS participantes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  celular TEXT,
  estado TEXT NOT NULL DEFAULT 'ACTIVO',
  observaciones TEXT,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cadenas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  anio INTEGER NOT NULL,
  estado TEXT NOT NULL DEFAULT 'BORRADOR',
  valor_aporte_quincenal REAL NOT NULL,
  numero_puestos INTEGER NOT NULL,
  valor_puesto_total REAL NOT NULL,
  cadena_origen_id INTEGER,
  fecha_inicio TEXT,
  fecha_fin TEXT,
  creada_por INTEGER,
  creada_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(cadena_origen_id) REFERENCES cadenas(id),
  FOREIGN KEY(creada_por) REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS cadena_participantes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cadena_id INTEGER NOT NULL,
  participante_id INTEGER NOT NULL,
  cantidad_puestos REAL NOT NULL DEFAULT 1,
  fraccion_total REAL NOT NULL DEFAULT 1,
  activo INTEGER NOT NULL DEFAULT 1,
  observaciones TEXT,
  UNIQUE(cadena_id, participante_id),
  FOREIGN KEY(cadena_id) REFERENCES cadenas(id),
  FOREIGN KEY(participante_id) REFERENCES participantes(id)
);

CREATE TABLE IF NOT EXISTS puestos_cadena (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cadena_id INTEGER NOT NULL,
  numero_puesto INTEGER NOT NULL,
  participante_id INTEGER NOT NULL,
  fraccion REAL NOT NULL DEFAULT 1,
  estado TEXT NOT NULL DEFAULT 'ASIGNADO',
  fecha_sorteo TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  asignado_por INTEGER,
  confirmado INTEGER NOT NULL DEFAULT 0,
  observaciones TEXT,
  FOREIGN KEY(cadena_id) REFERENCES cadenas(id),
  FOREIGN KEY(participante_id) REFERENCES participantes(id),
  FOREIGN KEY(asignado_por) REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS quincenas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cadena_id INTEGER NOT NULL,
  numero_quincena INTEGER NOT NULL,
  fecha_programada TEXT NOT NULL,
  fecha_limite_pago TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'ABIERTA',
  UNIQUE(cadena_id, numero_quincena),
  FOREIGN KEY(cadena_id) REFERENCES cadenas(id)
);

CREATE TABLE IF NOT EXISTS obligaciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cadena_id INTEGER NOT NULL,
  quincena_id INTEGER NOT NULL,
  participante_id INTEGER NOT NULL,
  puesto_id INTEGER NOT NULL,
  valor_esperado REAL NOT NULL,
  valor_pagado REAL NOT NULL DEFAULT 0,
  saldo_pendiente REAL NOT NULL,
  estado TEXT NOT NULL DEFAULT 'PENDIENTE',
  FOREIGN KEY(cadena_id) REFERENCES cadenas(id),
  FOREIGN KEY(quincena_id) REFERENCES quincenas(id),
  FOREIGN KEY(participante_id) REFERENCES participantes(id),
  FOREIGN KEY(puesto_id) REFERENCES puestos_cadena(id)
);

CREATE TABLE IF NOT EXISTS pagos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  obligacion_id INTEGER NOT NULL,
  cadena_id INTEGER NOT NULL,
  participante_id INTEGER NOT NULL,
  fecha_pago TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  valor_pago REAL NOT NULL,
  metodo_pago TEXT NOT NULL,
  comprobante_url TEXT,
  estado TEXT NOT NULL DEFAULT 'APROBADO',
  registrado_por INTEGER,
  observaciones TEXT,
  FOREIGN KEY(obligacion_id) REFERENCES obligaciones(id),
  FOREIGN KEY(cadena_id) REFERENCES cadenas(id),
  FOREIGN KEY(participante_id) REFERENCES participantes(id),
  FOREIGN KEY(registrado_por) REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS entregas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cadena_id INTEGER NOT NULL,
  quincena_id INTEGER NOT NULL,
  puesto_id INTEGER NOT NULL,
  participante_id INTEGER NOT NULL,
  valor_esperado REAL NOT NULL,
  valor_entregado REAL NOT NULL DEFAULT 0,
  fecha_programada TEXT NOT NULL,
  fecha_entrega TEXT,
  estado TEXT NOT NULL DEFAULT 'PROGRAMADA',
  comprobante_url TEXT,
  observaciones TEXT,
  FOREIGN KEY(cadena_id) REFERENCES cadenas(id),
  FOREIGN KEY(quincena_id) REFERENCES quincenas(id),
  FOREIGN KEY(puesto_id) REFERENCES puestos_cadena(id),
  FOREIGN KEY(participante_id) REFERENCES participantes(id)
);

CREATE TABLE IF NOT EXISTS caja_movimientos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cadena_id INTEGER NOT NULL,
  tipo TEXT NOT NULL,
  origen TEXT NOT NULL,
  origen_id INTEGER,
  entrada REAL NOT NULL DEFAULT 0,
  salida REAL NOT NULL DEFAULT 0,
  saldo_resultante REAL NOT NULL DEFAULT 0,
  registrado_por INTEGER,
  fecha TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  observaciones TEXT,
  FOREIGN KEY(cadena_id) REFERENCES cadenas(id),
  FOREIGN KEY(registrado_por) REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS auditoria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER,
  entidad TEXT NOT NULL,
  entidad_id INTEGER,
  accion TEXT NOT NULL,
  valor_anterior TEXT,
  valor_nuevo TEXT,
  motivo TEXT,
  fecha TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(usuario_id) REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS plantillas_cadena (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  cadena_origen_id INTEGER,
  copiar_participantes INTEGER NOT NULL DEFAULT 1,
  copiar_cantidad_puestos INTEGER NOT NULL DEFAULT 1,
  copiar_contactos INTEGER NOT NULL DEFAULT 1,
  copiar_configuracion_financiera INTEGER NOT NULL DEFAULT 1,
  copiar_calendario INTEGER NOT NULL DEFAULT 0,
  activo INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY(cadena_origen_id) REFERENCES cadenas(id)
);
`);

const admin = db.prepare('SELECT id FROM usuarios WHERE email = ?').get('admin@cadena.local');
if (!admin) {
  const hash = bcrypt.hashSync('Admin123*', 10);
  db.prepare(`
    INSERT INTO usuarios(nombre,email,password_hash,rol)
    VALUES (?,?,?,?)
  `).run('Administrador Principal', 'admin@cadena.local', hash, 'ADMIN_PRINCIPAL');
}

console.log('Base de datos inicializada.');
