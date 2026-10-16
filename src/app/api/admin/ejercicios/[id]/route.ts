import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { ruta } from "@/lib/admin/ruta"
import { redondear } from "@/lib/admin/moneda"
import type { FichaEjercicio } from "@/lib/admin/ejercicios"

type Ctx = { params: Promise<{ id: string }> }

/**
 * La ficha de un ejercicio: cuánto se asentó, mes por mes, cuál fue el
 * resultado y en qué está el cierre. Todo sale del libro diario entre el inicio
 * y el fin del ejercicio; no guarda nada.
 */
export const GET = ruta("ficha ejercicio GET", async (_req: Request, { params }: Ctx) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso
  const { id } = await params

  const { data: e, error } = await supabase
    .from("ejercicios_resumen")
    .select("id, nombre, inicio, fin, estado, asientos, en_curso")
    .eq("id", id)
    .maybeSingle()
  if (error) throw error
  if (!e) return NextResponse.json({ error: "Ese ejercicio no existe" }, { status: 404 })

  type Linea = {
    asiento_id: string
    fecha: string
    origen: string
    cuenta_tipo: string
    debe_ars: number | string
    haber_ars: number | string
  }
  const lineas: Linea[] = []
  for (let i = 0; ; i += 1000) {
    const { data, error: e2 } = await supabase
      .from("libro_diario")
      .select("asiento_id, fecha, origen, cuenta_tipo, debe_ars, haber_ars")
      .gte("fecha", e.inicio as string)
      .lte("fecha", e.fin as string)
      .order("linea_id")
      .range(i, i + 999)
    if (e2) throw e2
    lineas.push(...((data ?? []) as Linea[]))
    if (!data || data.length < 1000) break
  }

  const asientosPorOrigen: Record<string, Set<string>> = {}
  const porMes = new Map<string, { asientos: Set<string>; importe: number }>()
  let debe = 0
  let haber = 0
  let ingresos = 0
  let egresos = 0
  for (const l of lineas) {
    const d = Number(l.debe_ars)
    const h = Number(l.haber_ars)
    debe += d
    haber += h
    ;(asientosPorOrigen[l.origen] ??= new Set()).add(l.asiento_id)
    const mes = l.fecha.slice(0, 7)
    const m = porMes.get(mes) ?? { asientos: new Set(), importe: 0 }
    m.asientos.add(l.asiento_id)
    m.importe += d
    porMes.set(mes, m)
    // Saldo natural: las ganancias crecen por el haber, las pérdidas por el debe.
    if (l.cuenta_tipo === "ingreso") ingresos += h - d
    if (l.cuenta_tipo === "egreso") egresos += d - h
  }

  const [{ data: borradores }, ventas, compras] = await Promise.all([
    supabase
      .from("asientos_borradores")
      .select("tipo, fecha, estado")
      .neq("estado", "descartado")
      .gte("fecha", e.inicio as string)
      .lte("fecha", e.fin as string),
    supabase
      .from("comprobantes")
      .select("id", { count: "exact", head: true })
      .eq("tipo", "venta")
      .eq("estado", "confirmado")
      .gte("fecha", e.inicio as string)
      .lte("fecha", e.fin as string),
    supabase
      .from("comprobantes")
      .select("id", { count: "exact", head: true })
      .eq("tipo", "compra")
      .eq("estado", "confirmado")
      .gte("fecha", e.inicio as string)
      .lte("fecha", e.fin as string),
  ])

  const estadoDe = (tipo: string) => {
    const b = (borradores ?? []).filter((x) => x.tipo === tipo)
    return b.some((x) => x.estado === "registrado") ? "registrado" : b.length ? "borrador" : "falta"
  }

  const ficha: FichaEjercicio = {
    ejercicio: {
      id: Number(e.id),
      nombre: e.nombre as string,
      inicio: e.inicio as string,
      fin: e.fin as string,
      estado: e.estado as "abierto" | "cerrado",
      asientos: Number(e.asientos),
      enCurso: Boolean(e.en_curso),
    },
    asientosPorOrigen: Object.fromEntries(Object.entries(asientosPorOrigen).map(([k, v]) => [k, v.size])),
    meses: [...porMes.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mes, m]) => ({ mes, asientos: m.asientos.size, importe: redondear(m.importe) })),
    debe: redondear(debe),
    haber: redondear(haber),
    ingresos: redondear(ingresos),
    egresos: redondear(egresos),
    resultado: redondear(ingresos - egresos),
    facturasVenta: ventas.count ?? 0,
    facturasCompra: compras.count ?? 0,
    apertura: estadoDe("apertura"),
    ajuste: estadoDe("ajuste_inflacion"),
    cierre: estadoDe("cierre"),
  }
  return NextResponse.json(ficha)
})
