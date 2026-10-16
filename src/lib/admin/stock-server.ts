import { supabase } from "@/lib/supabase"
import { formatearNumero } from "@/lib/admin/comprobantes"
import { cotizacionHasta } from "@/lib/admin/cotizaciones-server"
import type {
  ComprobanteParaStock,
  FichaStock,
  ItemStock,
  MovimientoStock,
  SerieStock,
  TipoMovimiento,
} from "@/lib/admin/stock"

/**
 * Lectura y escritura del stock. Sólo servidor.
 *
 * Sin transacciones del lado de supabase-js: cuando un alta toca dos tablas
 * (el movimiento y sus series) y la segunda falla, se borra la primera a mano.
 * Un movimiento de 5 tabletas con 3 series cargadas es peor que no tenerlo.
 */

export class ErrorStock extends Error {}

const n = (v: unknown) => {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}
const nn = (v: unknown) => (v === null || v === undefined ? null : n(v))

function aItem(f: Record<string, unknown>): ItemStock {
  return {
    id: f.item_id as string,
    nombre: f.nombre as string,
    codigo: (f.codigo as string | null) ?? null,
    llevaSerie: Boolean(f.lleva_serie),
    activo: Boolean(f.activo),
    saldo: n(f.saldo),
    entradas: n(f.entradas),
    salidas: n(f.salidas),
    costoPromedioUsd: nn(f.costo_promedio_usd),
    ultimoMovimiento: (f.ultimo_movimiento as string | null) ?? null,
  }
}

export async function leerItems(): Promise<ItemStock[]> {
  const { data, error } = await supabase.from("stock_saldos").select("*").order("nombre")
  if (error) throw error
  return (data ?? []).map(aItem)
}

export async function leerFicha(id: string): Promise<FichaStock | null> {
  const [{ data: saldo, error: e1 }, { data: item, error: e2 }] = await Promise.all([
    supabase.from("stock_saldos").select("*").eq("item_id", id).maybeSingle(),
    supabase.from("stock_items").select("notas").eq("id", id).maybeSingle(),
  ])
  if (e1) throw e1
  if (e2) throw e2
  if (!saldo) return null

  const [{ data: movs, error: e3 }, { data: series, error: e4 }] = await Promise.all([
    supabase
      .from("stock_movimientos_vigentes")
      .select("*")
      .eq("item_id", id)
      .order("fecha", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("stock_series")
      .select("id, serie, movimiento_entrada_id, movimiento_salida_id")
      .eq("item_id", id)
      .order("serie"),
  ])
  if (e3) throw e3
  if (e4) throw e4

  const fechaDe = new Map((movs ?? []).map((m) => [m.id as string, m.fecha as string]))
  const seriesDe = new Map<string, string[]>()
  for (const s of series ?? []) {
    for (const mov of [s.movimiento_entrada_id, s.movimiento_salida_id]) {
      if (!mov) continue
      const lista = seriesDe.get(mov as string) ?? []
      lista.push(s.serie as string)
      seriesDe.set(mov as string, lista)
    }
  }

  let corrido = 0
  const movimientos: MovimientoStock[] = (movs ?? []).map((m) => {
    corrido = Math.round((corrido + n(m.cantidad)) * 100) / 100
    return {
      id: m.id as string,
      fecha: m.fecha as string,
      tipo: m.tipo as TipoMovimiento,
      cantidad: n(m.cantidad),
      precioUsd: nn(m.precio_usd),
      tc: nn(m.tc),
      detalle: (m.detalle as string | null) ?? null,
      comprobanteId: (m.comprobante_id as string | null) ?? null,
      comprobante: m.comprobante_clase
        ? `${m.comprobante_clase} ${formatearNumero(nn(m.comprobante_punto_venta), nn(m.comprobante_numero))}`
        : null,
      entidad: (m.entidad as string | null) ?? null,
      saldo: corrido,
      series: seriesDe.get(m.id as string) ?? [],
    }
  })

  return {
    item: { ...aItem(saldo), notas: (item?.notas as string | null) ?? null },
    // Lo más reciente arriba, como un extracto. El saldo ya viene calculado
    // en orden cronológico.
    movimientos: movimientos.reverse(),
    series: (series ?? []).map(
      (s): SerieStock => ({
        id: s.id as string,
        serie: s.serie as string,
        entrada: fechaDe.get(s.movimiento_entrada_id as string) ?? "",
        salida: s.movimiento_salida_id ? (fechaDe.get(s.movimiento_salida_id as string) ?? null) : null,
      })
    ),
  }
}

/* ── Altas ────────────────────────────────────────────────────────────────── */

export type DatosMovimiento = {
  tipo: TipoMovimiento
  /** En un ajuste, hacia dónde va. En los demás lo decide el tipo. */
  sentido?: "entrada" | "salida"
  fecha: string
  /** Siempre positiva: el signo lo pone el tipo. */
  cantidad: number
  precioUsd: number | null
  tc: number | null
  comprobanteId: string | null
  detalle: string | null
  /** Las series que entran (en una entrada) … */
  seriesNuevas?: string[]
  /** … o los ids de las que salen (en una salida). */
  seriesSalida?: string[]
}

export type ResultadoMovimiento = { id: string; saldo: number; aviso: string | null }

export async function registrarMovimiento(
  itemId: string,
  d: DatosMovimiento,
  usuarioId: string
): Promise<ResultadoMovimiento> {
  const { data: item, error } = await supabase
    .from("stock_saldos")
    .select("item_id, nombre, lleva_serie, saldo")
    .eq("item_id", itemId)
    .maybeSingle()
  if (error) throw error
  if (!item) throw new ErrorStock("Ese ítem no existe")

  const entra = d.tipo === "inicial" || d.tipo === "compra" || (d.tipo === "ajuste" && d.sentido !== "salida")
  if (!(d.cantidad > 0)) throw new ErrorStock("La cantidad tiene que ser mayor que cero")
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha)) throw new ErrorStock("Falta la fecha")

  if (d.tipo === "compra" || d.tipo === "venta") {
    if (!d.comprobanteId) throw new ErrorStock("Elegí la factura")
    const { data: c } = await supabase
      .from("comprobantes")
      .select("tipo, estado")
      .eq("id", d.comprobanteId)
      .maybeSingle()
    if (!c || c.tipo !== d.tipo || c.estado !== "confirmado") {
      throw new ErrorStock(`La factura tiene que ser de ${d.tipo} y estar confirmada`)
    }
  }

  if ((d.tipo === "inicial" || d.tipo === "compra") && (d.precioUsd === null || d.tc === null)) {
    throw new ErrorStock("Falta el costo en dólares o el tipo de cambio: es lo que valoriza el stock")
  }

  if (item.lleva_serie) {
    if (!Number.isInteger(d.cantidad)) throw new ErrorStock("Con número de serie la cantidad va en unidades enteras")
    if (entra) {
      const nuevas = d.seriesNuevas ?? []
      if (nuevas.length !== d.cantidad) {
        throw new ErrorStock(`Entran ${d.cantidad} unidades y hay ${nuevas.length} números de serie`)
      }
      const { data: existentes } = await supabase.from("stock_series").select("serie").eq("item_id", itemId)
      const ya = new Set((existentes ?? []).map((s) => (s.serie as string).toLowerCase()))
      const repetida = nuevas.find((s) => ya.has(s.toLowerCase()))
      if (repetida) throw new ErrorStock(`La serie ${repetida} ya está cargada en este ítem`)
    } else {
      const salen = d.seriesSalida ?? []
      if (salen.length !== d.cantidad) {
        throw new ErrorStock(`Salen ${d.cantidad} unidades y elegiste ${salen.length} números de serie`)
      }
    }
  }

  const { data: mov, error: e2 } = await supabase
    .from("stock_movimientos")
    .insert({
      item_id: itemId,
      fecha: d.fecha,
      tipo: d.tipo,
      cantidad: entra ? d.cantidad : -d.cantidad,
      precio_usd: d.precioUsd,
      tc: d.tc,
      comprobante_id: d.comprobanteId,
      detalle: d.detalle?.trim() || null,
      created_by: usuarioId,
    })
    .select("id")
    .single()
  if (e2) throw e2

  try {
    if (item.lleva_serie && entra) {
      const { error: e3 } = await supabase.from("stock_series").insert(
        (d.seriesNuevas ?? []).map((serie) => ({
          item_id: itemId,
          serie,
          movimiento_entrada_id: mov.id,
        }))
      )
      if (e3) throw e3
    }
    if (item.lleva_serie && !entra) {
      const { data: tomadas, error: e4 } = await supabase
        .from("stock_series")
        .update({ movimiento_salida_id: mov.id })
        .in("id", d.seriesSalida ?? [])
        .eq("item_id", itemId)
        .is("movimiento_salida_id", null)
        .select("id")
      if (e4) throw e4
      if ((tomadas ?? []).length !== d.cantidad) {
        throw new ErrorStock("Alguna de las series elegidas ya había salido. Volvé a elegirlas.")
      }
    }
  } catch (e) {
    await supabase.from("stock_series").update({ movimiento_salida_id: null }).eq("movimiento_salida_id", mov.id)
    await supabase.from("stock_movimientos").delete().eq("id", mov.id)
    throw e
  }

  const saldo = Math.round((n(item.saldo) + (entra ? d.cantidad : -d.cantidad)) * 100) / 100
  return {
    id: mov.id as string,
    saldo,
    aviso: saldo < 0 ? `${item.nombre} quedó en ${saldo}: se registró igual, revisá si falta cargar una compra.` : null,
  }
}

export type DatosItem = {
  nombre: string
  codigo: string | null
  llevaSerie: boolean
  notas: string | null
  inicial: Omit<DatosMovimiento, "tipo" | "comprobanteId"> | null
}

export async function crearItem(d: DatosItem, usuarioId: string): Promise<{ id: string; aviso: string | null }> {
  const nombre = d.nombre.trim()
  if (!nombre) throw new ErrorStock("Falta el nombre del ítem")

  const { data: item, error } = await supabase
    .from("stock_items")
    .insert({
      nombre,
      codigo: d.codigo?.trim() || null,
      lleva_serie: d.llevaSerie,
      notas: d.notas?.trim() || null,
      created_by: usuarioId,
    })
    .select("id")
    .single()
  if (error) {
    if (error.code === "23505") {
      throw new ErrorStock(
        error.message.includes("codigo") ? "Ya hay un ítem con ese código" : "Ya hay un ítem con ese nombre"
      )
    }
    throw error
  }

  if (d.inicial) {
    try {
      await registrarMovimiento(item.id as string, { ...d.inicial, tipo: "inicial", comprobanteId: null }, usuarioId)
    } catch (e) {
      // Sin el stock inicial que se pidió, el ítem no se crea: es una sola carga.
      await supabase.from("stock_items").delete().eq("id", item.id)
      throw e
    }
  }
  return { id: item.id as string, aviso: null }
}

export async function borrarMovimiento(id: string): Promise<void> {
  const { data: series } = await supabase
    .from("stock_series")
    .select("serie, movimiento_salida_id")
    .eq("movimiento_entrada_id", id)
  const vendida = (series ?? []).find((s) => s.movimiento_salida_id)
  if (vendida) {
    throw new ErrorStock(`No se puede borrar: la serie ${vendida.serie} ya salió. Borrá primero esa salida.`)
  }
  const { error } = await supabase.from("stock_movimientos").delete().eq("id", id)
  if (error) throw error
}

/* ── Facturas para colgar un movimiento ───────────────────────────────────── */

export async function buscarComprobantes(
  tipo: "compra" | "venta",
  q: string
): Promise<ComprobanteParaStock[]> {
  const { data, error } = await supabase
    .from("comprobantes")
    .select(
      `id, tipo, clase, punto_venta, numero, fecha, moneda, tc, total,
       clientes:cliente_id (razon_social), proveedores:proveedor_id (razon_social)`
    )
    .eq("tipo", tipo)
    .eq("estado", "confirmado")
    .order("fecha", { ascending: false })
    .limit(300)
  if (error) throw error

  const filas = (data ?? []).map((c) => {
    const ent = (tipo === "venta" ? c.clientes : c.proveedores) as unknown as { razon_social?: string } | null
    return {
      id: c.id as string,
      tipo,
      etiqueta: `${c.clase} ${formatearNumero(nn(c.punto_venta), nn(c.numero))}`,
      fecha: c.fecha as string,
      entidad: ent?.razon_social ?? "—",
      moneda: c.moneda as "ARS" | "USD",
      tc: nn(c.tc),
      total: n(c.total),
    }
  })

  const t = q.trim().toLowerCase()
  if (!t) return filas.slice(0, 30)
  return filas
    .filter((f) => f.entidad.toLowerCase().includes(t) || f.etiqueta.toLowerCase().includes(t))
    .slice(0, 30)
}

/** El dólar para valorizar una entrada que no viene de una factura en dólares. */
export async function dolarDe(fecha: string): Promise<number | null> {
  return cotizacionHasta(fecha)
}
