import { supabase } from "@/lib/supabase"
import { formatearNumero } from "@/lib/admin/comprobantes"

/**
 * Qué facturas de venta corresponden a cada presupuesto (tabla
 * `presupuesto_facturas`, aditiva). Es lo que permite mostrar los Puntos con el
 * detalle por factura que pidió el contador.
 */

export type FacturaVinculable = {
  id: string
  etiqueta: string
  fecha: string
  moneda: "ARS" | "USD"
  total: number
}

const n = (v: unknown) => (v === null || v === undefined ? null : Number(v))

function aFactura(c: Record<string, unknown>): FacturaVinculable {
  return {
    id: c.id as string,
    etiqueta: `${c.clase} ${formatearNumero(n(c.punto_venta), n(c.numero))}`,
    fecha: c.fecha as string,
    moneda: c.moneda as "ARS" | "USD",
    total: Number(c.total),
  }
}

const COLUMNAS = "id, clase, punto_venta, numero, fecha, moneda, total"

/** Las vinculadas y las que se pueden vincular: ventas confirmadas del mismo cliente. */
export async function facturasDelPresupuesto(presupuestoId: string) {
  const { data: p, error } = await supabase
    .from("presupuestos")
    .select("cliente_id")
    .eq("id", presupuestoId)
    .maybeSingle()
  if (error) throw error
  if (!p) return null

  const { data: links, error: e2 } = await supabase
    .from("presupuesto_facturas")
    .select("comprobante_id")
    .eq("presupuesto_id", presupuestoId)
  if (e2) throw e2
  const ids = (links ?? []).map((l) => l.comprobante_id as string)

  const [vinculadas, candidatas] = await Promise.all([
    ids.length
      ? supabase.from("comprobantes").select(COLUMNAS).in("id", ids).order("fecha")
      : Promise.resolve({ data: [], error: null }),
    p.cliente_id
      ? supabase
          .from("comprobantes")
          .select(COLUMNAS)
          .eq("tipo", "venta")
          .eq("estado", "confirmado")
          .eq("cliente_id", p.cliente_id)
          .order("fecha", { ascending: false })
          .limit(60)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (vinculadas.error) throw vinculadas.error
  if (candidatas.error) throw candidatas.error

  return {
    vinculadas: (vinculadas.data ?? []).map(aFactura),
    // Sólo facturas: una nota de crédito no es "con qué se facturó", y como
    // a veces tiene el mismo importe se la proponía como la factura.
    candidatas: (candidatas.data ?? [])
      .filter((c) => !ids.includes(c.id as string) && String(c.clase).startsWith("FC"))
      .map(aFactura),
  }
}

export async function vincularFactura(presupuestoId: string, comprobanteId: string, usuarioId: string | null) {
  const { data: c } = await supabase
    .from("comprobantes")
    .select("tipo, estado")
    .eq("id", comprobanteId)
    .maybeSingle()
  if (!c || c.tipo !== "venta" || c.estado !== "confirmado") {
    return "Tiene que ser una factura de venta confirmada"
  }
  const { error } = await supabase
    .from("presupuesto_facturas")
    .upsert({ presupuesto_id: presupuestoId, comprobante_id: comprobanteId, created_by: usuarioId })
  if (error) throw error
  // Vincularla a mano levanta un descarte anterior: la persona cambió de idea.
  await supabase
    .from("presupuesto_facturas_descartes")
    .delete()
    .eq("presupuesto_id", presupuestoId)
    .eq("comprobante_id", comprobanteId)
  return null
}

export async function desvincularFactura(presupuestoId: string, comprobanteId: string) {
  const { error } = await supabase
    .from("presupuesto_facturas")
    .delete()
    .eq("presupuesto_id", presupuestoId)
    .eq("comprobante_id", comprobanteId)
  if (error) throw error
  // Queda anotado para que el PDF del legajo no la vuelva a vincular sola.
  const { error: e2 } = await supabase
    .from("presupuesto_facturas_descartes")
    .upsert({ presupuesto_id: presupuestoId, comprobante_id: comprobanteId }, { ignoreDuplicates: true })
  if (e2) throw e2
}

/* ── Vinculación automática desde el legajo ──────────────────────────────── */

/**
 * El CUIT de Accedra: el PDF de una factura propia empieza con él. Un PDF de
 * un proveedor, aunque tenga el mismo formato, lleva el CUIT del proveedor y
 * no se toma.
 */
const CUIT_ACCEDRA = "30711588864"

/**
 * Los códigos de ARCA de las facturas de venta. Sólo facturas: una nota de
 * crédito en el legajo no es "con qué se facturó" y no suma Puntos.
 */
const CLASE_DE_CODIGO: Record<string, string> = {
  "001": "FCA",
  "006": "FCB",
  "201": "FCEA",
  "019": "FCE",
}

/** `30711588864_001_00002_00002789 ANDREANI.pdf` → FCA 2-2789. */
export function facturaDelNombre(nombre: string): { clase: string; puntoVenta: number; numero: number } | null {
  const m = nombre.match(/^(\d{11})_(\d{3})_(\d{5})_(\d{8})(?!\d)/)
  if (!m || m[1] !== CUIT_ACCEDRA) return null
  const clase = CLASE_DE_CODIGO[m[2]]
  if (!clase) return null
  return { clase, puntoVenta: Number(m[3]), numero: Number(m[4]) }
}

/** Un PDF del legajo que no se pudo vincular, y por qué. */
export type FacturaFaltante = { etiqueta: string; motivo: "sin_cargar" | "otro_cliente" }

/**
 * La conciliación nunca rompe la pantalla que la llama: si falla, se ve lo ya
 * vinculado y queda en el log.
 */
export async function conciliarSinFallar(presupuestoId?: string): Promise<Conciliacion> {
  try {
    return await conciliarLegajo(presupuestoId)
  } catch (e) {
    console.error("[conciliar legajo]", e)
    return { faltan: {}, nuevos: 0 }
  }
}

export type Conciliacion = {
  /** Por presupuesto, los PDF que no se pudieron vincular. */
  faltan: Record<string, FacturaFaltante[]>
  /** Cuántos vínculos se crearon recién: si es 0, lo ya leído sigue valiendo. */
  nuevos: number
}

/**
 * Vincula las facturas cuyo PDF está en el legajo del presupuesto.
 *
 * Vincula sólo cuando todo coincide: el PDF es una factura propia (CUIT de
 * Accedra), hay una factura de venta **confirmada** con ese tipo, punto de
 * venta y número, y es **del mismo cliente** que el presupuesto. Lo que alguien
 * desvinculó a mano no se vuelve a vincular.
 *
 * Es idempotente y se llama al subir un adjunto y al leer las facturas —del
 * presupuesto o del reporte—: así una factura que se carga en Administración
 * días después del PDF se vincula sola la próxima vez que alguien mira.
 *
 * Devuelve, por presupuesto, los PDF cuya factura todavía no está cargada,
 * para que el reporte diga qué falta en vez de un "sin vincular" a secas.
 */
export async function conciliarLegajo(presupuestoId?: string): Promise<Conciliacion> {
  // Sólo los que empiezan con el CUIT propio: el legajo también tiene fotos,
  // remitos y facturas de proveedores, y no hace falta traerlos.
  let q = supabase
    .from("presupuesto_adjuntos")
    .select("presupuesto_id, nombre")
    .like("nombre", `${CUIT_ACCEDRA}%`)
  if (presupuestoId) q = q.eq("presupuesto_id", presupuestoId)
  const { data: adjuntos, error } = await q
  if (error) throw error

  const pdfs = (adjuntos ?? [])
    .map((a) => ({ presupuestoId: a.presupuesto_id as string, f: facturaDelNombre(a.nombre as string) }))
    .filter((a): a is { presupuestoId: string; f: NonNullable<ReturnType<typeof facturaDelNombre>> } => a.f !== null)
  if (pdfs.length === 0) return { faltan: {}, nuevos: 0 }

  const idsPresupuesto = [...new Set(pdfs.map((p) => p.presupuestoId))]
  const [presupuestos, comprobantes, vinculos, descartes] = await Promise.all([
    supabase.from("presupuestos").select("id, cliente_id").in("id", idsPresupuesto),
    supabase
      .from("comprobantes")
      .select("id, clase, punto_venta, numero, cliente_id")
      .eq("tipo", "venta")
      .eq("estado", "confirmado")
      .in("numero", [...new Set(pdfs.map((p) => p.f.numero))]),
    supabase.from("presupuesto_facturas").select("presupuesto_id, comprobante_id").in("presupuesto_id", idsPresupuesto),
    supabase
      .from("presupuesto_facturas_descartes")
      .select("presupuesto_id, comprobante_id")
      .in("presupuesto_id", idsPresupuesto),
  ])
  for (const r of [presupuestos, comprobantes, vinculos, descartes]) if (r.error) throw r.error

  const clienteDe = new Map((presupuestos.data ?? []).map((p) => [p.id as string, p.cliente_id as string | null]))
  const par = (p: unknown, c: unknown) => `${p}|${c}`
  const yaEsta = new Set(
    [...(vinculos.data ?? []), ...(descartes.data ?? [])].map((v) => par(v.presupuesto_id, v.comprobante_id))
  )

  const nuevos: { presupuesto_id: string; comprobante_id: string; created_by: null }[] = []
  const faltan: Record<string, FacturaFaltante[]> = {}
  for (const { presupuestoId: pid, f } of pdfs) {
    const c = (comprobantes.data ?? []).find(
      (x) => x.clase === f.clase && Number(x.punto_venta) === f.puntoVenta && Number(x.numero) === f.numero
    )
    if (!c) {
      ;(faltan[pid] ??= []).push({ etiqueta: `${f.clase} ${formatearNumero(f.puntoVenta, f.numero)}`, motivo: "sin_cargar" })
      continue
    }
    // De otro cliente: o el PDF está en el presupuesto equivocado o la factura
    // se cargó a otro cliente. No se adivina; se avisa.
    if (!clienteDe.get(pid) || c.cliente_id !== clienteDe.get(pid)) {
      ;(faltan[pid] ??= []).push({ etiqueta: `${f.clase} ${formatearNumero(f.puntoVenta, f.numero)}`, motivo: "otro_cliente" })
      continue
    }
    if (yaEsta.has(par(pid, c.id))) continue
    yaEsta.add(par(pid, c.id))
    nuevos.push({ presupuesto_id: pid, comprobante_id: c.id as string, created_by: null })
  }

  if (nuevos.length) {
    const { error: e } = await supabase
      .from("presupuesto_facturas")
      .upsert(nuevos, { ignoreDuplicates: true })
    if (e) throw e
  }
  return { faltan, nuevos: nuevos.length }
}

/** Para el reporte: presupuesto → las etiquetas de sus facturas. */
export type FacturaDeReporte = { id: string; etiqueta: string; fecha: string; moneda: "ARS" | "USD"; total: number }

export async function facturasPorPresupuesto(): Promise<Record<string, FacturaDeReporte[]>> {
  const { data, error } = await supabase
    .from("presupuesto_facturas")
    .select("presupuesto_id, comprobantes:comprobante_id (id, clase, punto_venta, numero, fecha, moneda, total)")
  if (error) throw error
  const out: Record<string, FacturaDeReporte[]> = {}
  for (const f of data ?? []) {
    const c = f.comprobantes as unknown as {
      id: string
      clase: string
      punto_venta: number | null
      numero: number | null
      fecha: string
      moneda: "ARS" | "USD"
      total: number
    } | null
    if (!c) continue
    ;(out[f.presupuesto_id as string] ??= []).push({
      id: c.id,
      etiqueta: `${c.clase} ${formatearNumero(c.punto_venta, c.numero)}`,
      fecha: c.fecha,
      moneda: c.moneda,
      total: Number(c.total),
    })
  }
  for (const lista of Object.values(out)) lista.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.etiqueta.localeCompare(b.etiqueta))
  return out
}
