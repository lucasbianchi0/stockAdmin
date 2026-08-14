import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { ruta } from "@/lib/admin/ruta"
import { redondear } from "@/lib/admin/moneda"
import type { FilaMayor, Mayor, OrigenAsiento } from "@/lib/admin/asientos"

/**
 * El mayor de una cuenta, con saldo corrido.
 *
 * Misma decisión que el extracto bancario y por el mismo motivo: **el saldo
 * arranca de lo que había antes del período**, no de cero. Un mayor de agosto
 * que empieza en cero no se puede conciliar con nada.
 *
 * Con `auxiliar` se filtra el submayor: el mayor de Proveedores restringido a un
 * proveedor es su cuenta corriente, que es la pregunta que más se hace.
 */

const TOPE = 2000

export const GET = ruta("mayor GET", async (req: Request) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso

  const url = new URL(req.url)
  const cuentaId = url.searchParams.get("cuenta") ?? ""
  const desde = url.searchParams.get("desde") ?? ""
  const hasta = url.searchParams.get("hasta") ?? ""
  const auxiliar = url.searchParams.get("auxiliar") ?? ""

  if (!cuentaId) {
    return NextResponse.json({ error: "Falta la cuenta" }, { status: 400 })
  }

  /* ── La cuenta ────────────────────────────────────────────────────────── */

  const { data: cuenta, error: errCuenta } = await supabase
    .from("plan_cuentas")
    .select("id, codigo, nombre, tipo")
    .eq("id", cuentaId)
    .maybeSingle()

  if (errCuenta) {
    console.error("[mayor cuenta]", errCuenta)
    return NextResponse.json({ error: "No se pudo cargar la cuenta" }, { status: 500 })
  }
  if (!cuenta) return NextResponse.json({ error: "La cuenta no existe" }, { status: 404 })

  /* ── Lo anterior al período ───────────────────────────────────────────── */

  let saldoInicial = 0

  if (desde) {
    let previos = supabase
      .from("libro_diario")
      .select("debe_ars, haber_ars")
      .eq("cuenta_id", cuentaId)
      .lt("fecha", desde)
    if (auxiliar) previos = previos.eq("auxiliar_id", auxiliar)

    const { data, error } = await previos
    if (error) {
      console.error("[mayor previos]", error)
      return NextResponse.json({ error: "No se pudo calcular el saldo inicial" }, { status: 500 })
    }
    saldoInicial = redondear(
      (data ?? []).reduce((a, l) => a + Number(l.debe_ars) - Number(l.haber_ars), 0)
    )
  }

  /* ── Las líneas del período ───────────────────────────────────────────── */

  let query = supabase
    .from("libro_diario")
    .select(
      `asiento_id, fecha, numero, origen, descripcion, detalle,
       debe_ars, haber_ars, auxiliar_tipo, auxiliar_id`
    )
    .eq("cuenta_id", cuentaId)

  if (desde) query = query.gte("fecha", desde)
  if (hasta) query = query.lte("fecha", hasta)
  if (auxiliar) query = query.eq("auxiliar_id", auxiliar)

  const { data, error } = await query
    .order("fecha", { ascending: true })
    .order("numero", { ascending: true })
    .order("orden", { ascending: true })
    .limit(TOPE)

  if (error) {
    console.error("[mayor]", error)
    return NextResponse.json({ error: "No se pudo cargar el mayor" }, { status: 500 })
  }

  const filasCrudas = data ?? []

  /* ── Nombres del submayor ─────────────────────────────────────────────── */

  const nombres = new Map<string, string>()
  const ids = [...new Set(filasCrudas.filter((f) => f.auxiliar_id).map((f) => f.auxiliar_id as string))]

  if (ids.length) {
    const tipo = filasCrudas.find((f) => f.auxiliar_id)?.auxiliar_tipo
    const tabla = tipo === "proveedor" ? "proveedores" : "clientes"
    const { data: ents } = await supabase.from(tabla).select("id, razon_social").in("id", ids)
    ents?.forEach((e) => nombres.set(e.id as string, e.razon_social as string))
  }

  let corrido = saldoInicial
  let debe = 0
  let haber = 0

  const filas: FilaMayor[] = filasCrudas.map((l) => {
    const d = Number(l.debe_ars)
    const h = Number(l.haber_ars)
    debe += d
    haber += h
    corrido = redondear(corrido + d - h)

    return {
      asientoId: l.asiento_id as string,
      fecha: l.fecha as string,
      numero: Number(l.numero),
      origen: l.origen as OrigenAsiento,
      descripcion: l.descripcion as string,
      detalle: (l.detalle as string | null) ?? null,
      debeArs: d,
      haberArs: h,
      saldoArs: corrido,
      auxiliarNombre: l.auxiliar_id ? (nombres.get(l.auxiliar_id as string) ?? null) : null,
    }
  })

  const mayor: Mayor = {
    cuenta: {
      id: cuenta.id as string,
      codigo: cuenta.codigo as string,
      nombre: cuenta.nombre as string,
      tipo: cuenta.tipo as Mayor["cuenta"]["tipo"],
    },
    periodo: {
      desde: desde || null,
      hasta: hasta || null,
      saldoInicial,
      debe: redondear(debe),
      haber: redondear(haber),
      saldoFinal: corrido,
      cantidad: filas.length,
      truncado: filas.length >= TOPE,
    },
    filas,
  }

  return NextResponse.json(mayor)
})
