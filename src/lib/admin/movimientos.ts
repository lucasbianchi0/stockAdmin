import type { Moneda } from "@/lib/admin/moneda"

/**
 * Movimientos financieros: el libro mayor de caja, bancos y MercadoLibre.
 *
 * Todo lo que toca un saldo pasa por acá. Los que vienen de un cobro o un pago
 * los crea el recibo y **no se editan desde esta pantalla**: se anula el recibo
 * y el `on delete cascade` se los lleva. Los que se cargan a mano son tres:
 *
 *  · **gasto** — un movimiento sin factura: impuestos, gastos bancarios,
 *    sueldos, suscripciones a fondos. Es lo que el pliego llama «otros
 *    movimientos» y la categoría que más se usa. Va casi siempre para afuera,
 *    pero no siempre: un rescate de FIMA es plata que **vuelve** a la cuenta y
 *    no es ni una venta ni una transferencia, así que también entra por acá y
 *    suma en la columna de créditos del extracto.
 *  · **transferencia** — mover plata entre cuentas propias. Son dos movimientos
 *    hermanos, y como pueden estar en monedas distintas también sirve para
 *    registrar la compra o venta de dólares.
 *  · **ajuste** — la corrección manual. Existe porque siempre hay una, y es
 *    mejor tenerla explícita que verla disfrazada de gasto.
 */

export const CATEGORIAS_GASTO = [
  "impuestos",
  "bancarios",
  "sueldos",
  "cargas_sociales",
  "servicios",
  "inversiones",
  "otros",
] as const
export type CategoriaGasto = (typeof CATEGORIAS_GASTO)[number]

export const CATEGORIA_LABEL: Record<CategoriaGasto, string> = {
  impuestos: "Impuestos",
  bancarios: "Gastos bancarios",
  sueldos: "Sueldos",
  cargas_sociales: "Cargas sociales",
  servicios: "Servicios",
  /** Suscripciones y rescates de fondos —los FIMA del Galicia—, que el pliego
   *  nombra por su nombre en las dos direcciones: la suscripción sale de la
   *  cuenta y el rescate vuelve a ella. */
  inversiones: "Fondos e inversiones",
  otros: "Otros",
}

export const ORIGENES_MOVIMIENTO = [
  "cobro",
  "pago",
  "gasto",
  "transferencia",
  "manual",
] as const
export type OrigenMovimiento = (typeof ORIGENES_MOVIMIENTO)[number]

export const ORIGEN_LABEL: Record<OrigenMovimiento, string> = {
  cobro: "Cobro",
  pago: "Pago",
  gasto: "Gasto",
  transferencia: "Transferencia",
  manual: "Ajuste",
}

/** Cuáles se pueden borrar desde la pantalla de movimientos. Los que cuelgan de
 *  un recibo se anulan desde el recibo, para que no queden facturas canceladas
 *  sin la plata que las respalda. */
export function esEditable(origen: OrigenMovimiento): boolean {
  return origen === "gasto" || origen === "manual" || origen === "transferencia"
}

export type Movimiento = {
  id: string
  cuentaId: string
  cuentaNombre: string | null
  fecha: string
  tipo: "ingreso" | "egreso"
  importe: number
  moneda: Moneda
  /** Pesos por dólar del día del movimiento. `null` = no se conoce, y entonces
   *  el importe en la otra moneda tampoco. */
  tc: number | null
  importeArs: number | null
  importeUsd: number | null
  /** Cuando el documento que lo originó estaba en otra moneda: cuánto era y en
   *  qué moneda, antes de convertirlo a la de la cuenta. Un cobro de
   *  USD 2.855,31 acreditado en el Galicia en pesos guarda acá los dólares. */
  importeOrigen: number | null
  monedaOrigen: Moneda | null
  signo: 1 | -1
  origen: OrigenMovimiento
  pagoId: string | null
  cuentaContableId: string | null
  cuentaContableNombre: string | null
  referencia: string | null
  detalle: string | null
  categoria: CategoriaGasto | null
  conciliado: boolean
  createdAt: string
}
