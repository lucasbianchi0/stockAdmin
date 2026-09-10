import { NextResponse } from "next/server"

import { ruta } from "@/lib/admin/ruta"
import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { COLUMNAS_POPUP, aPopup } from "@/lib/marketing/popups-server"

type Ctx = { params: Promise<{ id: string }> }

/**
 * Prender y apagar, sin pasar por el editor.
 *
 * Existe como endpoint aparte y no como un PATCH parcial por una razón de uso:
 * apagar un popup es lo que se hace apurado —el evento se suspendió, el precio
 * salió mal— y tiene que ser un clic desde la lista. Obligar a abrir el editor,
 * que manda la fila entera, es pedirle a alguien apurado que confirme dieciocho
 * campos que no venía a tocar.
 *
 * Es también el único cambio que no pisa nada más, así que es seguro hacerlo con
 * un JSON de un solo campo.
 */
export const POST = ruta("popups activo", async (req: Request, ctx: Ctx) => {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const { id } = await ctx.params

  let activo: boolean
  try {
    const body = (await req.json()) as { activo?: unknown }
    if (typeof body.activo !== "boolean") {
      return NextResponse.json({ error: "Pedido inválido" }, { status: 400 })
    }
    activo = body.activo
  } catch {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("popups")
    .update({ activo })
    .eq("id", id)
    .select(COLUMNAS_POPUP)
    .single()

  if (error || !data) {
    console.error("[popups activo]", error)
    return NextResponse.json({ error: "No se pudo cambiar el estado" }, { status: 500 })
  }

  return NextResponse.json({ popup: aPopup(data) })
})
