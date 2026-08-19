/**
 * Contabilidad: el vocabulario compartido entre el servidor y las pantallas.
 *
 * Tres lecturas del mismo dato, que son las tres preguntas que hace un contador:
 *
 *   · **Libro diario** — qué pasó, en orden cronológico. Un asiento por
 *     documento, con sus líneas.
 *   · **Mayor** — qué pasó en *una* cuenta, con saldo corrido. Es donde se ve
 *     que el saldo de Proveedores es la suma de lo que se debe.
 *   · **Sumas y saldos** — el estado de todas las cuentas en una fecha. Si la
 *     columna de saldos no da cero, algo está mal en la base y no en la pantalla.
 *
 * Los importes viajan siempre en pesos (`ars`). La moneda original queda en cada
 * línea como dato de lectura, pero sumar dos monedas en una misma columna es
 * exactamente el error que el punto 6 del contador pedía arreglar.
 */

import type { TipoCuenta } from "@/lib/admin/cuentas-vocabulario"

/* ── Vocabulario ──────────────────────────────────────────────────────────── */

export const ORIGENES_ASIENTO = ["comprobante", "pago", "movimiento", "manual"] as const
export type OrigenAsiento = (typeof ORIGENES_ASIENTO)[number]

export const ORIGEN_ASIENTO_LABEL: Record<OrigenAsiento, string> = {
  comprobante: "Factura",
  pago: "Recibo",
  movimiento: "Movimiento",
  manual: "Manual",
}

/** A dónde lleva el asiento cuando se hace clic en su origen. */
export function rutaDelOrigen(origen: OrigenAsiento, tipo?: string | null): string | null {
  switch (origen) {
    case "comprobante":
      return tipo === "compra" ? "/admin/compras" : "/admin/ventas"
    case "pago":
      return tipo === "pago" ? "/admin/pagos" : "/admin/cobros"
    case "movimiento":
      return "/admin/cuentas"
    default:
      return null
  }
}

/* ── Formas ───────────────────────────────────────────────────────────────── */

export type LineaAsiento = {
  id: string
  orden: number
  cuentaId: string
  cuentaCodigo: string
  cuentaNombre: string
  cuentaTipo: TipoCuenta
  debe: number
  haber: number
  debeArs: number
  haberArs: number
  moneda: "ARS" | "USD"
  tc: number
  detalle: string | null
  auxiliarTipo: "cliente" | "proveedor" | null
  auxiliarId: string | null
  auxiliarNombre: string | null
}

export type Asiento = {
  id: string
  fecha: string
  ejercicio: number
  numero: number
  origen: OrigenAsiento
  origenId: string | null
  descripcion: string
  lineas: LineaAsiento[]
  totalArs: number
}

export type FilaMayor = {
  asientoId: string
  fecha: string
  numero: number
  origen: OrigenAsiento
  descripcion: string
  detalle: string | null
  debeArs: number
  haberArs: number
  /** Saldo acumulado hasta esta línea inclusive. */
  saldoArs: number
  auxiliarNombre: string | null
}

export type Mayor = {
  cuenta: { id: string; codigo: string; nombre: string; tipo: TipoCuenta }
  periodo: {
    desde: string | null
    hasta: string | null
    saldoInicial: number
    debe: number
    haber: number
    saldoFinal: number
    cantidad: number
    truncado: boolean
  }
  filas: FilaMayor[]
}

export type FilaSumasSaldos = {
  cuentaId: string
  codigo: string
  nombre: string
  tipo: TipoCuenta
  debeArs: number
  haberArs: number
  saldoArs: number
  movimientos: number
}

export type SumasYSaldos = {
  filas: FilaSumasSaldos[]
  totales: { debe: number; haber: number; diferencia: number }
  /** Los totales de débitos y créditos tienen que ser idénticos. Si no lo son,
   *  hay un asiento mal escrito y la pantalla lo dice en vez de disimularlo. */
  cuadra: boolean
  porRubro: { tipo: TipoCuenta; saldo: number; cuentas: number }[]
}

/**
 * Un documento que está en los saldos pero no en el mayor.
 *
 * Trae más de lo que la vista `documentos_sin_asiento` sabe, y a propósito: con
 * la referencia y el importe alcanza para listarlo, pero no para **arreglarlo**.
 * Para elegir contra qué cuenta se imputa hay que ver de quién es la factura y
 * qué dice su detalle — si no, la pantalla obliga a abrir el documento en otra
 * solapa para poder decidir, y eso es exactamente la fricción que hace que la
 * lista de pendientes no se vacíe nunca.
 */
export type DocumentoSinAsiento = {
  origen: "comprobante" | "movimiento"
  id: string
  fecha: string
  referencia: string
  importeArs: number
  motivo: string
  /** `compra` o `venta` en un comprobante; `null` en un movimiento. */
  tipo: "compra" | "venta" | null
  /** El proveedor o cliente, o la cuenta financiera si es un movimiento. */
  contraparte: string | null
  /** El concepto, que es lo que permite elegir la cuenta sin abrir nada. */
  detalle: string | null
  /** Ya imputado quiere decir que el motivo es otro y que cambiar la cuenta no
   *  lo va a arreglar. La pantalla lo distingue. */
  cuentaContableId: string | null
}

/* ── Lectura ──────────────────────────────────────────────────────────────── */

/**
 * De qué lado queda el saldo de una cuenta según su naturaleza.
 *
 * Activo y pérdida son deudoras: su saldo normal es débitos menos créditos.
 * Pasivo, patrimonio y ganancia son acreedoras y se leen al revés. Sin esto,
 * el mayor de Proveedores muestra el saldo en negativo, que es contablemente
 * correcto y visualmente inútil.
 */
export function esDeudora(tipo: TipoCuenta): boolean {
  return tipo === "activo" || tipo === "egreso"
}

/** El saldo con el signo que espera quien lee esa cuenta. */
export function saldoNatural(tipo: TipoCuenta, saldoArs: number): number {
  return esDeudora(tipo) ? saldoArs : -saldoArs
}

/** El total del asiento: la suma de un solo lado, porque los dos son iguales. */
export function totalDelAsiento(lineas: Pick<LineaAsiento, "debeArs">[]): number {
  return lineas.reduce((a, l) => a + l.debeArs, 0)
}
