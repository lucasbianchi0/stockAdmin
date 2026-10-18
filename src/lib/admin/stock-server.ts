import { supabase } from "@/lib/supabase"
import { formatearNumero } from "@/lib/admin/comprobantes"
import { cotizacionHasta } from "@/lib/admin/cotizaciones-server"
import {
  DESTINOS,
  TIPOS_MOVIMIENTO,
  UNIDADES,
  UNIDAD_INFO,
  aDolares,
  type ComprobanteParaStock,
  type Destino,
  type FichaStock,
  type ItemStock,
  type MonedaStock,
  type MovimientoStock,
  type SerieStock,
  type TipoMovimiento,
  type Unidad,
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
    destino: ((f.destino as Destino | undefined) ?? "venta") as Destino,
    unidad: ((f.unidad as Unidad | undefined) ?? "unidad") as Unidad,
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
  // Las cuatro de una: cada viaje a la base son ~200 ms, y en serie se notaban.
  // Si el ítem no existe, las otras tres vuelven vacías y no hay daño.
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const [{ data: saldo, error: e1 }, { data: item, error: e2 }, { data: movs, error: e3 }, { data: series, error: e4 }] = await Promise.all([
    supabase.from("stock_saldos").select("*").eq("item_id", id).maybeSingle(),
    supabase.from("stock_items").select("notas").eq("id", id).maybeSingle(),
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
  if (e1) throw e1
  if (e2) throw e2
  if (e3) throw e3
  if (e4) throw e4
  if (!saldo) return null

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
      moneda: (m.moneda as MonedaStock | undefined) ?? "USD",
      // Los movimientos de antes de la moneda sólo tienen el precio en dólares.
      precio: nn(m.precio) ?? nn(m.precio_usd),
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
  /** El precio unitario en `moneda`. El stock lo valoriza en dólares: si es en pesos, se divide por `tc`. */
  moneda: MonedaStock
  precio: number | null
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
  const conFactura = d.tipo === "compra" || d.tipo === "venta"
  // Todo lo que hay que leer para validar, en un solo viaje.
  const [{ data: item, error }, { data: factura }, { data: existentes }] = await Promise.all([
    supabase.from("stock_saldos").select("item_id, nombre, lleva_serie, unidad, saldo").eq("item_id", itemId).maybeSingle(),
    conFactura && d.comprobanteId
      ? supabase.from("comprobantes").select("tipo, estado").eq("id", d.comprobanteId).maybeSingle()
      : Promise.resolve({ data: null }),
    (d.seriesNuevas ?? []).length
      ? supabase.from("stock_series").select("serie").eq("item_id", itemId)
      : Promise.resolve({ data: [] as { serie: string }[] }),
  ])
  if (error) throw error
  if (!item) throw new ErrorStock("Ese ítem no existe")
  if (!TIPOS_MOVIMIENTO.includes(d.tipo)) throw new ErrorStock("Tipo de movimiento desconocido")

  const entra = d.tipo === "inicial" || d.tipo === "compra" || (d.tipo === "ajuste" && d.sentido !== "salida")
  const unidad = UNIDAD_INFO[(item.unidad as Unidad) ?? "unidad"]
  if (!(d.cantidad > 0)) throw new ErrorStock("La cantidad tiene que ser mayor que cero")
  if (!unidad.fraccion && !Number.isInteger(d.cantidad)) {
    throw new ErrorStock(`Se mide en ${unidad.varios}: la cantidad va sin decimales`)
  }
  const moneda: MonedaStock = d.moneda === "ARS" ? "ARS" : "USD"
  const precio = typeof d.precio === "number" && Number.isFinite(d.precio) ? d.precio : null
  const tc = typeof d.tc === "number" && Number.isFinite(d.tc) && d.tc > 0 ? d.tc : null
  if (precio !== null && precio < 0) throw new ErrorStock("El precio no puede ser negativo")
  if (precio !== null && !tc) throw new ErrorStock("Falta el tipo de cambio")
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha)) throw new ErrorStock("Falta la fecha")

  if (conFactura) {
    if (!d.comprobanteId) throw new ErrorStock("Elegí la factura")
    const c = factura as { tipo: string; estado: string } | null
    if (!c || c.tipo !== d.tipo || c.estado !== "confirmado") {
      throw new ErrorStock(`La factura tiene que ser de ${d.tipo} y estar confirmada`)
    }
  }

  if (d.tipo === "consumo" && !d.detalle?.trim()) throw new ErrorStock("Contá en qué trabajo se usó")

  if ((d.tipo === "inicial" || d.tipo === "compra") && (precio === null || tc === null)) {
    throw new ErrorStock("Falta el costo o el tipo de cambio: es lo que valoriza el stock")
  }

  if (item.lleva_serie) {
    if (!Number.isInteger(d.cantidad)) throw new ErrorStock("Con número de serie la cantidad va en unidades enteras")
    if (entra) {
      const nuevas = (d.seriesNuevas ?? []).map((s) => String(s).trim()).filter(Boolean)
      if (nuevas.length !== d.cantidad) {
        throw new ErrorStock(`Entran ${d.cantidad} unidades y hay ${nuevas.length} números de serie`)
      }
      const vistas = new Set<string>()
      for (const s of nuevas) {
        if (vistas.has(s.toLowerCase())) throw new ErrorStock(`La serie ${s} está dos veces`)
        vistas.add(s.toLowerCase())
      }
      const ya = new Set((existentes ?? []).map((s) => (s.serie as string).toLowerCase()))
      const repetida = nuevas.find((s) => ya.has(s.toLowerCase()))
      if (repetida) throw new ErrorStock(`La serie ${repetida} ya está cargada en este ítem`)
      d.seriesNuevas = nuevas
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
      moneda,
      precio,
      precio_usd: precio !== null && tc ? aDolares(precio, moneda, tc) : null,
      tc: precio !== null ? tc : null,
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
  destino: Destino
  unidad: Unidad
  llevaSerie: boolean
  notas: string | null
  inicial: Omit<DatosMovimiento, "tipo" | "comprobanteId"> | null
}

/** Lo que se guarda de un ítem, validado. Vale para el alta y para la edición. */
function filaItem(d: Omit<DatosItem, "inicial">) {
  const nombre = d.nombre?.trim()
  if (!nombre) throw new ErrorStock("Falta el nombre del ítem")
  if (!DESTINOS.includes(d.destino)) throw new ErrorStock("Elegí si es para vender o material de trabajo")
  if (!UNIDADES.includes(d.unidad)) throw new ErrorStock("Elegí en qué se mide")
  if (d.llevaSerie && d.unidad !== "unidad") throw new ErrorStock("Con número de serie se cuenta por unidades")
  return {
    nombre,
    codigo: d.codigo?.trim() || null,
    destino: d.destino,
    unidad: d.unidad,
    lleva_serie: d.llevaSerie,
    notas: d.notas?.trim() || null,
  }
}

function errorDeDuplicado(error: { code?: string; message: string }): never {
  if (error.code === "23505") {
    throw new ErrorStock(
      error.message.includes("codigo") ? "Ya hay un ítem con ese código" : "Ya hay un ítem con ese nombre"
    )
  }
  throw error
}

export async function crearItem(d: DatosItem, usuarioId: string): Promise<{ id: string; aviso: string | null }> {
  const { data: item, error } = await supabase
    .from("stock_items")
    .insert({ ...filaItem(d), created_by: usuarioId })
    .select("id")
    .single()
  if (error) errorDeDuplicado(error)

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

/**
 * Corregir un ítem: nombre, código, para qué es, en qué se mide. El número de
 * serie no se cambia si ya hay series cargadas, ni la unidad si los movimientos
 * que ya tiene no entran en ella (2,5 m no pasan a 2,5 cajas).
 */
export async function editarItem(id: string, d: Omit<DatosItem, "inicial">): Promise<void> {
  const fila = filaItem(d)
  const [{ data: actual }, { count: series }, { data: movs }] = await Promise.all([
    supabase.from("stock_items").select("lleva_serie").eq("id", id).maybeSingle(),
    supabase.from("stock_series").select("id", { count: "exact", head: true }).eq("item_id", id),
    supabase.from("stock_movimientos").select("cantidad").eq("item_id", id),
  ])
  if (!actual) throw new ErrorStock("Ese ítem no existe")
  if (actual.lleva_serie !== fila.lleva_serie && (series ?? 0) > 0) {
    throw new ErrorStock("Ya tiene números de serie cargados: no se puede cambiar si lleva serie")
  }
  // Pasar a "con serie" con stock ya cargado dejaría unidades sin número que
  // después no se pueden elegir al sacarlas.
  if (!actual.lleva_serie && fila.lleva_serie && (movs ?? []).length > 0) {
    throw new ErrorStock("Ya tiene movimientos sin número de serie: para controlarlo por serie, creá un ítem nuevo")
  }
  if (!UNIDAD_INFO[fila.unidad].fraccion && (movs ?? []).some((m) => !Number.isInteger(n(m.cantidad)))) {
    throw new ErrorStock(`Tiene movimientos con decimales: no se puede medir en ${UNIDAD_INFO[fila.unidad].varios}`)
  }
  const { error } = await supabase.from("stock_items").update(fila).eq("id", id)
  if (error) errorDeDuplicado(error)
}

/**
 * Borrar un ítem con todo lo suyo: movimientos y series. Se puede porque el
 * stock no toca la contabilidad; las facturas a las que colgaban quedan igual.
 */
export async function borrarItem(id: string): Promise<void> {
  const { data, error } = await supabase.from("stock_items").delete().eq("id", id).select("id")
  if (error) throw error
  if (!data?.length) throw new ErrorStock("Ese ítem no existe")
}

/** Devuelve el ítem del movimiento, para releer su ficha. */
export async function borrarMovimiento(id: string): Promise<string | null> {
  const { data: series } = await supabase
    .from("stock_series")
    .select("serie, movimiento_salida_id")
    .eq("movimiento_entrada_id", id)
  const vendida = (series ?? []).find((s) => s.movimiento_salida_id)
  if (vendida) {
    throw new ErrorStock(`No se puede borrar: la serie ${vendida.serie} ya salió. Borrá primero esa salida.`)
  }
  const { data, error } = await supabase.from("stock_movimientos").delete().eq("id", id).select("item_id")
  if (error) throw error
  return (data?.[0]?.item_id as string | undefined) ?? null
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
  // Sin búsqueda van todas (las últimas 300): el diálogo las filtra en el navegador.
  if (!t) return filas
  return filas
    .filter((f) => f.entidad.toLowerCase().includes(t) || f.etiqueta.toLowerCase().includes(t))
    .slice(0, 30)
}

/** El dólar para valorizar una entrada que no viene de una factura en dólares. */
export async function dolarDe(fecha: string): Promise<number | null> {
  return cotizacionHasta(fecha)
}

/* ── Catálogo de Distecna para dar de alta un ítem ────────────────────────── */

export type ProductoCatalogo = {
  codigo: string
  nombre: string
  marca: string | null
  descripcion: string | null
}

/**
 * Productos del catálogo de Distecna (la tabla `products` que sincroniza el
 * inventario) para no tipear nombre y descripción a mano. Sólo eso: el precio
 * de Distecna no es el costo de Accedra, el costo se carga con la compra.
 */
export async function buscarCatalogo(q: string): Promise<ProductoCatalogo[]> {
  const t = q.trim().replace(/[%,()]/g, " ").trim()
  if (t.length < 2) return []
  const patron = `%${t.split(/\s+/).join("%")}%`
  const { data, error } = await supabase
    .from("products")
    .select("code, sku, name, brand, description")
    .or(`name.ilike.${patron},code.ilike.${patron},sku.ilike.${patron},brand.ilike.${patron}`)
    .order("name")
    .limit(20)
  if (error) throw error
  return (data ?? []).map((p) => ({
    codigo: p.code as string,
    nombre: ((p.name as string | null) ?? (p.sku as string | null) ?? (p.code as string)).trim(),
    marca: (p.brand as string | null) ?? null,
    descripcion: ((p.description as string | null) ?? "").trim() || null,
  }))
}
