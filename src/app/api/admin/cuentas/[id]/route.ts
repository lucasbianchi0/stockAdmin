import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { ruta } from "@/lib/admin/ruta"
import { esMoneda } from "@/lib/admin/moneda"
import {
  SELECT_CUENTA,
  aCuentaDetalle,
  camposDeCuenta,
  esNombreRepetido,
} from "@/lib/admin/cuentas-server"

type Ctx = { params: Promise<{ id: string }> }

/** Si la cuenta ya tiene plata registrada. Una cuenta con movimientos no puede
 *  cambiar de moneda, y su saldo inicial deja de ser un dato inocente. */
async function tieneMovimientos(cuentaId: string): Promise<boolean> {
  const { count } = await supabase
    .from("movimientos")
    .select("id", { count: "exact", head: true })
    .eq("cuenta_id", cuentaId)

  return (count ?? 0) > 0
}

/* ── GET · la ficha entera ────────────────────────────────────────────────── */

export const GET = ruta("cuentas GET id", async (_req: Request, ctx: Ctx) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso

  const { id } = await ctx.params

  const { data, error } = await supabase
    .from("cuentas_financieras")
    .select(SELECT_CUENTA)
    .eq("id", id)
    .maybeSingle()

  if (error) {
    console.error("[cuentas GET id]", error)
    return NextResponse.json({ error: "No se pudo cargar la cuenta" }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: "La cuenta no existe" }, { status: 404 })

  return NextResponse.json({ cuenta: aCuentaDetalle(data, await tieneMovimientos(id)) })
})

/* ── PATCH · corregir la cuenta ───────────────────────────────────────────── */

/**
 * Editar una caja, un banco o una billetera.
 *
 * Hasta acá las cuentas se creaban por SQL y no había forma de tocarlas desde
 * la pantalla, y eso dejaba tres cosas trabadas que se arreglan solas al poder
 * escribirlas:
 *
 *  · **El saldo inicial.** Es el renglón "SALDO ANTERIOR" del extracto y el
 *    punto de partida de todo lo demás: si está mal, están mal todos los saldos
 *    de la cuenta, y no hay ningún movimiento que corregir para arreglarlo.
 *  · **La cuenta contable.** Sin ella `asiento_de_movimiento` no arma nada, así
 *    que cada gasto de esa cuenta cae en la lista de documentos sin asiento y no
 *    había dónde ir a resolverlo.
 *  · **El CBU, el alias y el número**, que es lo que se compara contra el
 *    resumen del banco.
 *
 * La moneda es la excepción: con movimientos cargados no se cambia. Los
 * movimientos están en la moneda de su cuenta —lo garantiza un trigger— así que
 * cambiarla dejaría un banco en dólares lleno de importes que son pesos.
 */
export const PATCH = ruta("cuentas PATCH", async (req: Request, ctx: Ctx) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso

  const { id } = await ctx.params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }
  const raw = body as Record<string, unknown>

  const { data: actual } = await supabase
    .from("cuentas_financieras")
    .select("id, moneda")
    .eq("id", id)
    .maybeSingle()

  if (!actual) return NextResponse.json({ error: "La cuenta no existe" }, { status: 404 })

  const campos = camposDeCuenta(raw, "edicion")
  if ("error" in campos) return NextResponse.json({ error: campos.error }, { status: 400 })

  const conMovimientos = await tieneMovimientos(id)

  if (esMoneda(raw.moneda) && raw.moneda !== actual.moneda) {
    if (conMovimientos) {
      return NextResponse.json(
        {
          error:
            "La cuenta ya tiene movimientos cargados y no puede cambiar de moneda: los importes registrados están en la moneda vieja. Creá la cuenta en la otra moneda y pasá la plata con una transferencia.",
        },
        { status: 409 }
      )
    }
    campos.moneda = raw.moneda
  }

  if (Object.keys(campos).length === 0) {
    return NextResponse.json({ error: "No mandaste nada para cambiar" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("cuentas_financieras")
    .update(campos)
    .eq("id", id)
    .select(SELECT_CUENTA)
    .single()

  if (error || !data) {
    if (esNombreRepetido(error)) {
      return NextResponse.json(
        { error: "Ya hay otra cuenta con ese nombre en esa moneda" },
        { status: 409 }
      )
    }
    console.error("[cuentas PATCH]", error)
    return NextResponse.json({ error: "No se pudo guardar la cuenta" }, { status: 500 })
  }

  return NextResponse.json({ cuenta: aCuentaDetalle(data, conMovimientos) })
})

/* ── DELETE · dar de baja ─────────────────────────────────────────────────── */

/**
 * Una cuenta con movimientos no se borra: se desactiva.
 *
 * `movimientos.cuenta_id` es `on delete restrict`, y está bien que lo sea —
 * borrar el Galicia se llevaría puesto el historial de todo lo que pasó por él.
 * Desactivarla la saca de los selectores y del tablero sin tocar un solo
 * movimiento, que es lo que alguien quiere cuando cierra una cuenta.
 *
 * La que nunca se usó sí se borra: es una cuenta cargada por error, y dejarla
 * inactiva para siempre es basura en una lista que se mira todos los días.
 */
export const DELETE = ruta("cuentas DELETE", async (_req: Request, ctx: Ctx) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso

  const { id } = await ctx.params

  const { data: cuenta } = await supabase
    .from("cuentas_financieras")
    .select("id")
    .eq("id", id)
    .maybeSingle()

  if (!cuenta) return NextResponse.json({ ok: true })

  if (await tieneMovimientos(id)) {
    const { error } = await supabase
      .from("cuentas_financieras")
      .update({ activo: false })
      .eq("id", id)

    if (error) {
      console.error("[cuentas DELETE desactivar]", error)
      return NextResponse.json({ error: "No se pudo dar de baja la cuenta" }, { status: 500 })
    }
    return NextResponse.json({ ok: true, desactivada: true })
  }

  const { error } = await supabase.from("cuentas_financieras").delete().eq("id", id)
  if (error) {
    console.error("[cuentas DELETE]", error)
    return NextResponse.json({ error: "No se pudo borrar la cuenta" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, desactivada: false })
})
