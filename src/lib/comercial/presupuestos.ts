import type { Moneda } from "@/lib/admin/moneda"
import { redondear } from "@/lib/admin/moneda"

/**
 * Presupuestos: vocabulario y aritmética.
 *
 * La cuenta que gobierna cada renglón, leída de la planilla de Excel que esto
 * reemplaza:
 *
 *     venta unitaria  =  costo unitario × margen      (1,7 por defecto)
 *     impuesto        =  venta total    × break       (10 % por defecto)
 *     rentabilidad    =  venta total − costo total − impuesto
 *     renta %         =  rentabilidad  ÷ venta total
 *
 * El margen es un multiplicador y no un porcentaje sumado: en la planilla dice
 * "1,7" y quiere decir que se vende a 1,7 veces el costo. Escribirlo como "70 %
 * de recargo" daría el mismo número y obligaría a traducir mentalmente cada vez
 * que alguien compare el sistema con su Excel.
 */

/* ── Estados ──────────────────────────────────────────────────────────────── */

/**
 * El recorrido de un presupuesto. Es el del pedido, en orden: se arma, se manda,
 * el cliente acepta, y termina cuando existe la factura.
 */
export const ESTADOS = ["borrador", "enviado", "aceptado", "facturado"] as const
export type EstadoPresupuesto = (typeof ESTADOS)[number]

export const ESTADO_LABEL: Record<EstadoPresupuesto, string> = {
  borrador: "Borrador",
  enviado: "Enviado",
  aceptado: "Aceptado",
  facturado: "Facturado",
}

/** El tono del chip de cada estado. Solo "aceptado" es una buena noticia; el
 *  resto son etapas, no resultados, y pintarlas de colores sería ruido. */
export const ESTADO_TONO: Record<
  EstadoPresupuesto,
  "neutral" | "brand" | "success" | "warning"
> = {
  borrador: "neutral",
  enviado: "brand",
  aceptado: "success",
  facturado: "neutral",
}

/* ── Renglones ────────────────────────────────────────────────────────────── */

/**
 * Qué es un renglón.
 *
 * Decide dos cosas: qué margen le toca por defecto y bajo qué título se lista en
 * la propuesta que recibe el cliente, que separa MANO DE OBRA de MATERIALES.
 */
export const TIPOS_ITEM = ["material", "mano_obra", "otro"] as const
export type TipoItem = (typeof TIPOS_ITEM)[number]

export const TIPO_ITEM_LABEL: Record<TipoItem, string> = {
  material: "Material",
  mano_obra: "Mano de obra",
  otro: "Otro",
}

export type ItemPresupuesto = {
  id: string
  orden: number
  proveedor: string | null
  parte: string | null
  cantidad: number
  descripcion: string
  tipo: TipoItem
  costoUnitario: number
  venta: number
  impPct: number
  iva: number
  stock: boolean
}

export type Presupuesto = {
  id: string
  numero: number
  clienteId: string
  clienteNombre: string | null
  referencia: string
  fecha: string
  fechaValidez: string | null
  moneda: Moneda
  tc: number | null
  vendedorId: string | null
  vendedorNombre: string | null
  estado: EstadoPresupuesto
  breakPct: number
  margenMateriales: number
  margenManoObra: number
  alcance: string | null
  condiciones: string | null
  confidencialidad: string | null
  observaciones: string | null
  noContempla: string | null
  notaImportante: string | null
  createdAt: string
  items: ItemPresupuesto[]
  totales: TotalesPresupuesto
}

/** Lo que el listado necesita de cada presupuesto: la cabecera y sus totales,
 *  sin bajar los renglones de doscientos presupuestos para mostrar una tabla. */
export type PresupuestoFila = Omit<Presupuesto, "items">

/* ── Aritmética ───────────────────────────────────────────────────────────── */

export type CalculoItem = {
  costoTotal: number
  ventaTotal: number
  impuesto: number
  rentabilidad: number
  /** Sobre la venta, no sobre el costo. Es el número que la planilla llama
   *  "Renta %" y con el que se decide si un presupuesto vale la pena. */
  rentaPct: number
}

export function calcularItem(i: {
  cantidad: number
  costoUnitario: number
  venta: number
  impPct: number
}): CalculoItem {
  const costoTotal = redondear(i.cantidad * i.costoUnitario)
  const ventaTotal = redondear(i.cantidad * i.venta)
  const impuesto = redondear(ventaTotal * i.impPct)
  const rentabilidad = redondear(ventaTotal - costoTotal - impuesto)
  return {
    costoTotal,
    ventaTotal,
    impuesto,
    rentabilidad,
    // Sin venta no hay porcentaje que calcular: el flete que se absorbe tiene
    // rentabilidad negativa y 0 %, que es lo que muestra la planilla.
    rentaPct: ventaTotal === 0 ? 0 : rentabilidad / ventaTotal,
  }
}

export type TotalesPresupuesto = {
  costo: number
  venta: number
  impuesto: number
  rentabilidad: number
  rentaPct: number
}

export function calcularTotales(items: Parameters<typeof calcularItem>[0][]): TotalesPresupuesto {
  const t = items.reduce(
    (a, i) => {
      const c = calcularItem(i)
      return {
        costo: a.costo + c.costoTotal,
        venta: a.venta + c.ventaTotal,
        impuesto: a.impuesto + c.impuesto,
        rentabilidad: a.rentabilidad + c.rentabilidad,
      }
    },
    { costo: 0, venta: 0, impuesto: 0, rentabilidad: 0 }
  )
  return {
    costo: redondear(t.costo),
    venta: redondear(t.venta),
    impuesto: redondear(t.impuesto),
    rentabilidad: redondear(t.rentabilidad),
    rentaPct: t.venta === 0 ? 0 : redondear(t.rentabilidad) / redondear(t.venta),
  }
}

/**
 * El margen que le toca a un renglón según lo que es.
 *
 * "Otro" arranca en cero —no se vende— porque es lo que hace la planilla real:
 * el flete figura con costo 30 y venta 0, o sea que la empresa lo absorbe y su
 * renglón da rentabilidad negativa a propósito. Ponerle margen 1 —venderlo al
 * costo— daría un total distinto al de la planilla que esto reemplaza.
 *
 * Es solo el punto de partida: la venta de cualquier renglón se puede escribir
 * a mano, y el día que un flete sí se le cobre al cliente, se le escribe.
 */
export function margenDe(
  tipo: TipoItem,
  cabecera: { margenMateriales: number; margenManoObra: number }
): number {
  if (tipo === "material") return cabecera.margenMateriales
  if (tipo === "mano_obra") return cabecera.margenManoObra
  return 0
}

/** La venta que el sistema propone al cargar un costo. Después se puede pisar a
 *  mano y manda lo escrito, que es lo que el pedido pide expresamente. */
export function ventaSugerida(
  costoUnitario: number,
  tipo: TipoItem,
  cabecera: { margenMateriales: number; margenManoObra: number }
): number {
  return redondear(costoUnitario * margenDe(tipo, cabecera))
}
