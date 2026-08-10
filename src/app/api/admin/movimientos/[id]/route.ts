import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { ruta } from "@/lib/admin/ruta"
import { esEditable, type OrigenMovimiento } from "@/lib/admin/movimientos"

type Ctx = { params: Promise<{ id: string }> }

/** Marcar o desmarcar como conciliado. Es lo único que se edita de un movimiento
 *  ya cargado: el resto se borra y se vuelve a cargar. */
export const PATCH = ruta("movimientos PATCH", async (req: Request, ctx: Ctx) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso

  const { id } = await ctx.params

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }

  if (typeof body.conciliado !== "boolean") {
    return NextResponse.json({ error: "Solo se puede cambiar la conciliación" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("movimientos")
    .update({ conciliado: body.conciliado })
    .eq("id", id)
    .select("id")
    .maybeSingle()

  if (error) {
    console.error("[movimientos PATCH]", error)
    return NextResponse.json({ error: "No se pudo actualizar" }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: "Movimiento no encontrado" }, { status: 404 })

  return NextResponse.json({ ok: true })
})

/**
 * Borrar un movimiento cargado a mano.
 *
 * Los que cuelgan de un cobro o un pago no se tocan desde acá: borrarlos dejaría
 * el comprobante cancelado sin la plata que lo respalda, que es precisamente el
 * descuadre que todo el módulo trata de hacer imposible. Se anula el recibo y el
 * cascade se los lleva.
 */
export const DELETE = ruta("movimientos DELETE", async (_req: Request, ctx: Ctx) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso

  const { id } = await ctx.params

  const { data: mov } = await supabase
    .from("movimientos")
    .select("id, origen")
    .eq("id", id)
    .maybeSingle()

  if (!mov) return NextResponse.json({ error: "Movimiento no encontrado" }, { status: 404 })

  if (!esEditable(mov.origen as OrigenMovimiento)) {
    return NextResponse.json(
      {
        error:
          "Este movimiento viene de un cobro o un pago. Anulá el recibo desde su pantalla y el movimiento se va con él.",
      },
      { status: 409 }
    )
  }

  const { error } = await supabase.from("movimientos").delete().eq("id", id)

  if (error) {
    console.error("[movimientos DELETE]", error)
    return NextResponse.json({ error: "No se pudo borrar el movimiento" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
})
