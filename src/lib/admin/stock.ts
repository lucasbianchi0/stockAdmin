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
 * Y las de Lucas: sólo lo ven los administradores; cada ítem es o para vender
 * o material de trabajo; se mide en lo que corresponda (unidades, metros…); y
 * se puede comprar en dólares o en pesos —el stock se valoriza igual en
 * dólares, pasando los pesos al tipo de cambio de la compra—.
 */

export const TIPOS_MOVIMIENTO = ["inicial", "compra", "venta", "consumo", "ajuste"] as const
export type TipoMovimiento = (typeof TIPOS_MOVIMIENTO)[number]

export const TIPO_MOVIMIENTO_LABEL: Record<TipoMovimiento, string> = {
  inicial: "Stock inicial",
  compra: "Compra",
  venta: "Venta",
  consumo: "Uso en trabajo",
  ajuste: "Ajuste",
}

/** Para vender (sale con factura) o material de trabajo (sale como consumo). */
export const DESTINOS = ["venta", "material"] as const
export type Destino = (typeof DESTINOS)[number]

export const DESTINO_LABEL: Record<Destino, string> = {
  venta: "Para vender",
  material: "Material de trabajo",
}

export const UNIDADES = ["unidad", "metro", "kilo", "litro", "caja", "rollo"] as const
export type Unidad = (typeof UNIDADES)[number]

/** Singular, plural, abreviatura, y si admite fracciones (2,5 m sí; 2,5 cajas no). */
export const UNIDAD_INFO: Record<Unidad, { uno: string; varios: string; corto: string; fraccion: boolean }> = {
  unidad: { uno: "unidad", varios: "unidades", corto: "u.", fraccion: false },
  metro: { uno: "metro", varios: "metros", corto: "m", fraccion: true },
  kilo: { uno: "kilo", varios: "kilos", corto: "kg", fraccion: true },
  litro: { uno: "litro", varios: "litros", corto: "l", fraccion: true },
  caja: { uno: "caja", varios: "cajas", corto: "cajas", fraccion: false },
  rollo: { uno: "rollo", varios: "rollos", corto: "rollos", fraccion: false },
}

export type MonedaStock = "USD" | "ARS"

export type ItemStock = {
  id: string
  nombre: string
  codigo: string | null
  llevaSerie: boolean
  activo: boolean
  destino: Destino
  unidad: Unidad
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
  /** El precio unitario tal como se pagó o cobró, en `moneda`. */
  moneda: MonedaStock
  precio: number | null
  /** El mismo precio en dólares: lo que valoriza el stock. */
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

/**
 * Pesos de un movimiento. Si se pagó en pesos, lo que se pagó; si en dólares,
 * cantidad × precio × tipo de cambio.
 */
export function pesosDe(m: Pick<MovimientoStock, "cantidad" | "moneda" | "precio" | "precioUsd" | "tc">): number | null {
  const unitario = m.moneda === "ARS" ? m.precio : m.precioUsd !== null && m.tc !== null ? m.precioUsd * m.tc : null
  if (unitario === null) return null
  return Math.round(Math.abs(m.cantidad) * unitario * 100) / 100
}

/** Dólares de un movimiento: cantidad × precio en dólares. */
export function dolaresDe(m: Pick<MovimientoStock, "cantidad" | "precioUsd">): number | null {
  if (m.precioUsd === null) return null
  return Math.round(Math.abs(m.cantidad) * m.precioUsd * 100) / 100
}

/** Un precio en `moneda` pasado a dólares, con 4 decimales como en la base. */
export function aDolares(precio: number, moneda: MonedaStock, tc: number): number {
  return moneda === "USD" ? precio : Math.round((precio / tc) * 10000) / 10000
}

/** Dólares unitarios con los decimales que hagan falta: US$ 0,6494 y no US$ 0,65. */
export function decimalesUsd(n: number): number {
  return Math.abs(n) < 10 && Math.round(n * 100) !== n * 100 ? 4 : 2
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

/** 3 → "3", 2.5 → "2,5". Con unidad: "120 m", "3 unidades", "1 caja". */
export function formatearCantidad(n: number, unidad?: Unidad, largo = false): string {
  const cifra = n.toLocaleString("es-AR", { maximumFractionDigits: 2 })
  if (!unidad) return cifra
  const u = UNIDAD_INFO[unidad]
  const palabra = Math.abs(n) === 1 ? u.uno : u.varios
  return `${cifra} ${largo || unidad === "unidad" ? palabra : u.corto === u.varios ? palabra : u.corto}`
}
