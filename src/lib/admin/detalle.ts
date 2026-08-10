import type { Cliente } from "@/lib/admin/entidades"
import type { Comprobante } from "@/lib/admin/comprobantes"
import type { Moneda } from "@/lib/admin/moneda"

/**
 * Lo que se ve al abrir una fila.
 *
 * Los tipos viven acá y no en cada handler porque son el contrato entre el panel
 * de detalle y su endpoint, y ese contrato lo leen los dos lados.
 *
 * La regla que ordena todo el archivo: el detalle trae **lo que la fila no puede
 * mostrar**. Nada de repetir las mismas seis columnas en vertical — si abrir una
 * fila no agrega información, el panel no vale el click.
 */

/* ── Situación de una ficha ───────────────────────────────────────────────── */

/**
 * Cuánto debe un cliente (o cuánto le debemos a un proveedor), hoy.
 *
 * Las dos monedas van separadas y nunca sumadas: consolidarlas obligaría a
 * elegir un tipo de cambio, y el saldo cambiaría solo de un día para el otro sin
 * que nadie haya facturado ni cobrado nada.
 *
 * Las notas de crédito restan —entran con su signo—, así que este número es la
 * deuda neta y no la suma de los papeles pendientes.
 */
export type ResumenEntidad = {
  /** Comprobantes con saldo. Las notas de crédito no se cuentan acá: no son algo
   *  para ir a cobrar, son un descuento sobre lo que ya se debe. */
  cantidad: number
  pendienteArs: number
  pendienteUsd: number
  vencidas: number
  vencidoArs: number
  vencidoUsd: number
  /** El vencimiento más próximo entre lo que sigue impago, vencido o no. */
  proximoVencimiento: string | null
}

export const RESUMEN_VACIO: ResumenEntidad = {
  cantidad: 0,
  pendienteArs: 0,
  pendienteUsd: 0,
  vencidas: 0,
  vencidoArs: 0,
  vencidoUsd: 0,
  proximoVencimiento: null,
}

/** Un comprobante como lo lista el detalle de una ficha: lo mínimo para
 *  reconocerlo y saber si está saldado. */
export type ComprobanteBreve = {
  id: string
  clase: string
  numero: string
  fecha: string
  fechaVencimiento: string | null
  moneda: Moneda
  total: number
  saldo: number
  signo: 1 | -1
}

/** Un recibo como lo lista el detalle de una ficha. */
export type PagoBreve = {
  id: string
  fecha: string
  moneda: Moneda
  /** Lo que canceló: medios + retenciones. */
  total: number
  comprobantes: number
}

/** La ficha como la lista la tabla: con la plata pegada. Es lo que convierte el
 *  listado en algo accionable — sin esto es una agenda de contactos. */
export type EntidadConResumen = Cliente & { resumen: ResumenEntidad }

export type EntidadDetalle = {
  entidad: Cliente
  resumen: ResumenEntidad
  comprobantes: ComprobanteBreve[]
  pagos: PagoBreve[]
}

/* ── Detalle de un comprobante ────────────────────────────────────────────── */

/** Un recibo que imputó contra este comprobante: cuándo, cuánto y por dónde
 *  entró la plata. Es la respuesta a "¿esto ya se cobró y con qué?". */
export type ImputacionDetalle = {
  id: string
  pagoId: string
  fecha: string
  importe: number
  moneda: Moneda
  cuentas: string[]
  referencias: string[]
}

export type ComprobanteDetalle = {
  comprobante: Comprobante
  imputaciones: ImputacionDetalle[]
}
