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
    candidatas: (candidatas.data ?? []).filter((c) => !ids.includes(c.id as string)).map(aFactura),
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
  return null
}

export async function desvincularFactura(presupuestoId: string, comprobanteId: string) {
  const { error } = await supabase
    .from("presupuesto_facturas")
    .delete()
    .eq("presupuesto_id", presupuestoId)
    .eq("comprobante_id", comprobanteId)
  if (error) throw error
}

/** Para el reporte: presupuesto → las etiquetas de sus facturas. */
export type FacturaDeReporte = { id: string; etiqueta: string }

export async function facturasPorPresupuesto(): Promise<Record<string, FacturaDeReporte[]>> {
  const { data, error } = await supabase
    .from("presupuesto_facturas")
    .select("presupuesto_id, comprobantes:comprobante_id (id, clase, punto_venta, numero)")
  if (error) throw error
  const out: Record<string, FacturaDeReporte[]> = {}
  for (const f of data ?? []) {
    const c = f.comprobantes as unknown as {
      id: string
      clase: string
      punto_venta: number | null
      numero: number | null
    } | null
    if (!c) continue
    ;(out[f.presupuesto_id as string] ??= []).push({
      id: c.id,
      etiqueta: `${c.clase} ${formatearNumero(c.punto_venta, c.numero)}`,
    })
  }
  return out
}
