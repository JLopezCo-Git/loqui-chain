export type Rol = 'ADMIN_PRINCIPAL' | 'ADMIN_SECUNDARIO' | 'PARTICIPANTE';

export interface User {
  id: number;
  nombre: string;
  email: string;
  rol: Rol;
}

export type EstadoCadena = 'BORRADOR' | 'PENDIENTE_SORTEO' | 'ACTIVA';

export interface Cadena {
  id: number;
  nombre: string;
  anio: number;
  estado: EstadoCadena;
  valor_aporte_quincenal: number;
  numero_puestos: number;
  valor_puesto_total: number;
  cadena_origen_id: number | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  creada_por: number | null;
  creada_en: string;
}

export interface Participante {
  id: number;
  nombre: string;
  documento: string | null;
  celular: string | null;
  email: string | null;
  estado: string;
  observaciones: string | null;
  creado_en: string;
}

export interface CadenaParticipante {
  id: number;
  cadena_id: number;
  participante_id: number;
  cantidad_puestos: number;
  fraccion_total: number;
  activo: number;
  observaciones: string | null;
  participante?: string;
}

export interface PuestoCadena {
  id: number;
  cadena_id: number;
  numero_puesto: number;
  participante_id: number;
  fraccion: number;
  estado: string;
  fecha_sorteo: string;
  confirmado: number;
  observaciones: string | null;
  participante?: string;
}

export interface Obligacion {
  id: number;
  cadena_id: number;
  quincena_id: number;
  participante_id: number;
  puesto_id: number;
  valor_esperado: number;
  valor_pagado: number;
  saldo_pendiente: number;
  estado: string;
  participante?: string;
  numero_quincena?: number;
}

export interface Entrega {
  id: number;
  cadena_id: number;
  quincena_id: number;
  puesto_id: number;
  participante_id: number;
  valor_esperado: number;
  valor_entregado: number;
  fecha_programada: string;
  fecha_entrega: string | null;
  estado: string;
  comprobante_url: string | null;
  observaciones: string | null;
  participante?: string;
  numero_quincena?: number;
}

export interface GrillaFila {
  puesto_id: number;
  numero_puesto: number;
  fraccion: number;
  participante_id: number;
  participante: string;
  celdas: (Obligacion | null)[];
  entrega: Entrega | null;
}

export interface GrillaCadena {
  cadena: Cadena;
  quincenas: { id: number; numero_quincena: number; fecha_programada: string; fecha_limite_pago: string; estado: string }[];
  filas: GrillaFila[];
  caja: number;
}

export interface DashboardResumen {
  cadenasTotal: number;
  cadenasActivas: number;
  cajaGlobal: number;
  pendienteGlobal: number;
  entregasPendientes: number;
}

export type TableRow = Record<string, string | number | boolean | null | undefined>;
