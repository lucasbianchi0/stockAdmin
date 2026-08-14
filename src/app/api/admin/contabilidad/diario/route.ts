import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { ruta } from "@/lib/admin/ruta"
import { redondear } from "@/lib/admin/moneda"
import type { Asiento, LineaAsiento, OrigenAsiento } from "@/lib/admin/asientos"

/**
 * Libro diario: los asientos del período, cada uno con sus líneas.
 *
 * La consulta trae **líneas** y las agrupa acá en asientos. Podría hacerse al
 * revés —traer asientos y pedir sus líneas— pero eso son dos viajes y un N+1
 * cuando la página muestra cincuenta asientos.
 *
 * El nombre del auxiliar (qué cliente, qué proveedor) se resuelve en una segunda
 * consulta por lote en vez de un join por línea: son dos consultas fijas, no una
 * por asiento.
 */

/** Un asiento rara vez pasa de diez líneas, así que esto son ~200 asientos. */
const TOPE = 2000

export const GET = ruta("diario GET", async (req: Request) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso

  const url = new URL(req.url)
  const desde = url.searchParams.get("desde") ?? ""
  const hasta = url.searchParams.get("hasta") ?? ""
  const origen = url.searchParams.get("origen") ?? ""
  const cuenta = url.searchParams.get("cuenta") ?? ""

  let query = supabase
    .from("libro_diario")
    .select(
      `asiento_id, fecha, ejercicio, numero, origen, origen_id, descripcion,
       linea_id, orden, detalle, debe, haber, debe_ars, haber_ars, moneda, tc,
       auxiliar_tipo, auxiliar_id,
       cuenta_id, cuenta_codigo, cuenta_nombre, cuenta_tipo`
    )

  if (desde) query = query.gte("fecha", desde)
  if (hasta) query = query.lte("fecha", hasta)
  if (origen) query = query.eq("origen", origen)
  if (cuenta) query = query.eq("cuenta_id", cuenta)

  const { data, error } = await query
    .order("fecha", { ascending: false })
    .order("numero", { ascending: false })
    .order("orden", { ascending: true })
    .limit(TOPE)

  if (error) {
    console.error("[diario]", error)
    return NextResponse.json({ error: "No se pudo cargar el libro diario" }, { status: 500 })
  }

  const filas = data ?? []

  /* ── Los nombres de los auxiliares, en dos consultas ──────────────────── */

  const idsCliente = [
    ...new Set(filas.filter((f) => f.auxiliar_tipo === "cliente" && f.auxiliar_id).map((f) => f.auxiliar_id as string)),
  ]
  const idsProveedor = [
    ...new Set(filas.filter((f) => f.auxiliar_tipo === "proveedor" && f.auxiliar_id).map((f) => f.auxiliar_id as string)),
  ]

  const nombres = new Map<string, string>()
  await Promise.all([
    idsCliente.length
      ? supabase
          .from("clientes")
          .select("id, razon_social")
          .in("id", idsCliente)
          .then(({ data }) => data?.forEach((c) => nombres.set(c.id as string, c.razon_social as string)))
      : null,
    idsProveedor.length
      ? supabase
          .from("proveedores")
          .select("id, razon_social")
          .in("id", idsProveedor)
          .then(({ data }) => data?.forEach((p) => nombres.set(p.id as string, p.razon_social as string)))
      : null,
  ])

  /* ── De líneas sueltas a asientos ─────────────────────────────────────── */

  const porAsiento = new Map<string, Asiento>()

  for (const f of filas) {
    const id = f.asiento_id as string
    let asiento = porAsiento.get(id)

    if (!asiento) {
      asiento = {
        id,
        fecha: f.fecha as string,
        ejercicio: Number(f.ejercicio),
        numero: Number(f.numero),
        origen: f.origen as OrigenAsiento,
        origenId: (f.origen_id as string | null) ?? null,
        descripcion: f.descripcion as string,
        lineas: [],
        totalArs: 0,
      }
      porAsiento.set(id, asiento)
    }

    const linea: LineaAsiento = {
      id: f.linea_id as string,
      orden: Number(f.orden),
      cuentaId: f.cuenta_id as string,
      cuentaCodigo: f.cuenta_codigo as string,
      cuentaNombre: f.cuenta_nombre as string,
      cuentaTipo: f.cuenta_tipo as LineaAsiento["cuentaTipo"],
      debe: Number(f.debe),
      haber: Number(f.haber),
      debeArs: Number(f.debe_ars),
      haberArs: Number(f.haber_ars),
      moneda: f.moneda as "ARS" | "USD",
      tc: Number(f.tc),
      detalle: (f.detalle as string | null) ?? null,
      auxiliarTipo: (f.auxiliar_tipo as LineaAsiento["auxiliarTipo"]) ?? null,
      auxiliarId: (f.auxiliar_id as string | null) ?? null,
      auxiliarNombre: f.auxiliar_id ? (nombres.get(f.auxiliar_id as string) ?? null) : null,
    }

    asiento.lineas.push(linea)
    asiento.totalArs = redondear(asiento.totalArs + linea.debeArs)
  }

  const asientos = [...porAsiento.values()]

  return NextResponse.json({
    asientos,
    truncado: filas.length >= TOPE,
    cantidad: asientos.length,
  })
})
