/**
 * Stock: control de cantidades de lo que Accedra compra y vende.
 *
 * Lo que definió el contador el 15/10/2026, y que manda sobre todo lo de acá:
 *
 *  · **Sólo cantidades.** No genera asientos: lo que toca la contabilidad es la
 *    factura de compra o de venta.
 *  · **En dólares, a precio de compra**, con el tipo de cambio de la compra y su
 *    equivalente en pesos.
 *  · **Ítems libres** (Tabletas Wacom, Cables UTP). Los que llevan número de
 *    serie se detallan unidad por unidad; los que no, sólo por cantidad.
 *  · **Stock inicial** para lo que ya hay hoy.
 *  · **Vender sin stock se permite**: el sistema avisa, no frena.
 *
 * Y la de Lucas: sólo lo ven los administradores.
 */

export const TIPOS_MOVIMIENTO = ["inicial", "compra", "venta", "ajuste"] as const
export type TipoMovimiento = (typeof TIPOS_MOVIMIENTO)[number]

export const TIPO_MOVIMIENTO_LABEL: Record<TipoMovimiento, string> = {
  inicial: "Stock inicial",
  compra: "Compra",
  venta: "Venta",
  ajuste: "Ajuste",
}

export type ItemStock = {
  id: string
  nombre: string
  codigo: string | null
  llevaSerie: boolean
  activo: boolean
  saldo: number
  entradas: number
  salidas: number
  costoPromedioUsd: number | null
  ultimoMovimiento: string | null
}

export type MovimientoStock = {
  id: string
  fecha: string
  tipo: TipoMovimiento
  cantidad: number
  precioUsd: number | null
  tc: number | null
  detalle: string | null
  comprobanteId: string | null
  /** "FCA 00002-00002753", si vino de una factura. */
  comprobante: string | null
  /** Proveedor o cliente de la factura. */
  entidad: string | null
  /** Saldo después de este movimiento. */
  saldo: number
  series: string[]
}

export type SerieStock = {
  id: string
  serie: string
  entrada: string
  salida: string | null
}

export type FichaStock = {
  item: ItemStock & { notas: string | null }
  movimientos: MovimientoStock[]
  series: SerieStock[]
}

/** La factura a la que se cuelga una compra o una venta. */
export type ComprobanteParaStock = {
  id: string
  tipo: "compra" | "venta"
  etiqueta: string
  fecha: string
  entidad: string
  moneda: "ARS" | "USD"
  tc: number | null
  total: number
}

/** Pesos de un movimiento: cantidad × precio en dólares × tipo de cambio. */
export function pesosDe(m: Pick<MovimientoStock, "cantidad" | "precioUsd" | "tc">): number | null {
  if (m.precioUsd === null || m.tc === null) return null
  return Math.round(Math.abs(m.cantidad) * m.precioUsd * m.tc * 100) / 100
}

/**
 * Las series pegadas en un cuadro de texto: una por renglón, o separadas por
 * coma. Sin vacías ni repetidas, que es lo que se escapa al pegar de un Excel.
 */
export function parsearSeries(texto: string): { series: string[]; repetidas: string[] } {
  const crudas = texto
    .split(/[\n,;\t]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const vistas = new Set<string>()
  const repetidas: string[] = []
  const series: string[] = []
  for (const s of crudas) {
    const k = s.toLowerCase()
    if (vistas.has(k)) repetidas.push(s)
    else {
      vistas.add(k)
      series.push(s)
    }
  }
  return { series, repetidas }
}

/** 3 → "3", 2.5 → "2,5". */
export function formatearCantidad(n: number): string {
  return n.toLocaleString("es-AR", { maximumFractionDigits: 2 })
}
