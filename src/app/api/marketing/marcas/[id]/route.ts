import { NextResponse } from "next/server"

import { ruta } from "@/lib/admin/ruta"
import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { borrarObjetos } from "@/lib/marketing/eventos-server"

type Ctx = { params: Promise<{ id: string }> }

/**
 * Borrar una marca de la biblioteca. Los eventos que la usaban quedan con el id
 * colgado y simplemente dejan de mostrar ese logo —ver la migración—; por eso
 * la pantalla avisa antes.
 */
export const DELETE = ruta("marca DELETE", async (_req: Request, ctx: Ctx) => {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const { id } = await ctx.params
  const { data: actual } = await supabase.from("marcas").select("logo_ruta").eq("id", id).maybeSingle()

  const { error } = await supabase.from("marcas").delete().eq("id", id)
  if (error) {
    console.error("[marca DELETE]", error)
    return NextResponse.json({ error: "No se pudo borrar la marca" }, { status: 500 })
  }

  await borrarObjetos([actual?.logo_ruta as string | undefined])
  return NextResponse.json({ ok: true })
})
