import type { Moneda } from "@/lib/admin/moneda"

/**
 * Movimientos financieros: el libro mayor de caja, bancos y MercadoLibre.
 *
 * Todo lo que toca un saldo pasa por acá. Los que vienen de un cobro o un pago
 * los crea el recibo y **no se editan desde esta pantalla**: se anula el recibo
 * y el `on delete cascade` se los lleva. Los que se cargan a mano son tres:
 *
 *  · **gasto** — un egreso sin factura A o C: impuestos, gastos bancarios,
 *    sueldos. Es la categoría que pide el pliego y la que más se usa.
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
  "otros",
] as const
export type CategoriaGasto = (typeof CATEGORIAS_GASTO)[number]

export const CATEGORIA_LABEL: Record<CategoriaGasto, string> = {
  impuestos: "Impuestos",
  bancarios: "Gastos bancarios",
  sueldos: "Sueldos",
  cargas_sociales: "Cargas sociales",
  servicios: "Servicios",
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
  tc: number
  importeArs: number
  importeUsd: number
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
