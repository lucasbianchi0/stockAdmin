import type { Moneda } from "@/lib/admin/moneda"
import { redondear } from "@/lib/admin/moneda"

/**
 * Cobros de clientes: vocabulario y aritmética.
 *
 * La ecuación que gobierna un recibo, y que la UI muestra en vivo:
 *
 *     lo que cancela  =  lo que entró a la caja  +  las retenciones
 *
 * Las retenciones no son plata que se mueve: son parte de lo que salda la
 * factura y que en vez de entrar al banco se va como crédito fiscal. Olvidarlas
 * es el error clásico — se imputa por el total de la factura, entra menos plata
 * de la que dice el recibo, y la caja queda descuadrada sin que nadie sepa por
 * qué.
 */

export const RETENCIONES = ["ganancias", "iva", "iibb", "suss"] as const
export type Retencion = (typeof RETENCIONES)[number]

export const RETENCION_LABEL: Record<Retencion, string> = {
  ganancias: "Ganancias",
  iva: "IVA",
  iibb: "IIBB",
  suss: "SUSS",
}

/** Medio por el que entró la plata: una cuenta y un importe. Un cobro puede
 *  tener varios (mitad transferencia, mitad cheque). */
export type MedioCobro = {
  cuentaId: string
  importe: number
  referencia: string | null
}

export type ImputacionCobro = {
  comprobanteId: string
  importe: number
}

export type CuentaFinanciera = {
  id: string
  nombre: string
  tipo: "caja" | "banco" | "billetera"
  moneda: Moneda
  saldo?: number
}

/** Una factura pendiente, como la ve el panel de imputación. */
export type Pendiente = {
  id: string
  clase: string
  puntoVenta: number | null
  numero: number | null
  fecha: string
  fechaVencimiento: string | null
  moneda: Moneda
  tc: number
  total: number
  imputado: number
  saldo: number
  detalle: string | null
  signo: 1 | -1
}

export type Cobro = {
  id: string
  fecha: string
  clienteId: string
  clienteNombre: string | null
  moneda: Moneda
  tc: number
  retenciones: Record<Retencion, number>
  totalRetenciones: number
  /** Suma de los medios de pago: lo que entró de verdad. */
  totalMedios: number
  /** Suma de las imputaciones, en la moneda del recibo. */
  totalImputado: number
  observaciones: string | null
  createdAt: string
  medios: {
    id: string
    cuentaId: string
    cuentaNombre: string | null
    importe: number
    moneda: Moneda
    referencia: string | null
  }[]
  imputaciones: {
    id: string
    comprobanteId: string
    clase: string
    puntoVenta: number | null
    numero: number | null
    moneda: Moneda
    importe: number
  }[]
}

/* ── Aritmética ───────────────────────────────────────────────────────────── */

export function sumaRetenciones(r: Partial<Record<Retencion, number>>): number {
  return redondear(RETENCIONES.reduce((a, k) => a + (r[k] ?? 0), 0))
}

/**
 * Convierte un importe de la moneda del comprobante a la del recibo (o al
 * revés). El TC es siempre pesos por dólar, igual que en todo el módulo.
 */
export function convertir(
  importe: number,
  desde: Moneda,
  hacia: Moneda,
  tc: number
): number {
  if (desde === hacia) return redondear(importe)
  if (tc <= 0) return 0
  return desde === "USD" ? redondear(importe * tc) : redondear(importe / tc)
}

export type BalanceCobro = {
  /** Lo que cancela, en la moneda del recibo. */
  imputado: number
  /** Lo que entró a las cuentas. */
  medios: number
  retenciones: number
  /** medios + retenciones − imputado. Cero es lo que buscamos. */
  diferencia: number
  cuadra: boolean
}

/**
 * El control del recibo. Se tolera un centavo de diferencia: con importes en dos
 * monedas y conversiones de por medio, exigir cero exacto haría que un recibo
 * legítimo no se pueda guardar por un redondeo.
 */
export function balancear(
  imputadoEnMonedaRecibo: number,
  medios: number,
  retenciones: number
): BalanceCobro {
  const diferencia = redondear(medios + retenciones - imputadoEnMonedaRecibo)
  return {
    imputado: redondear(imputadoEnMonedaRecibo),
    medios: redondear(medios),
    retenciones: redondear(retenciones),
    diferencia,
    cuadra: Math.abs(diferencia) <= 0.01,
  }
}
