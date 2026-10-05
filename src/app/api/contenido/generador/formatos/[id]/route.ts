import { NextResponse } from "next/server"

import { ruta } from "@/lib/admin/ruta"
import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"

type Ctx = { params: Promise<{ id: string }> }

export const DELETE = ruta("generador formatos DELETE", async (_req: Request, ctx: Ctx) => {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const { id } = await ctx.params
  const { error } = await supabase.from("generador_formatos").delete().eq("id", id)

  if (error) {
    console.error("[generador formatos DELETE]", error)
    return NextResponse.json({ error: "No se pudo borrar el formato" }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
})
