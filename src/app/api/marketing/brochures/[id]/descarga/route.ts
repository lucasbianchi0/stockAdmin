import { NextResponse } from "next/server"

import { ruta } from "@/lib/admin/ruta"
import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"

type Ctx = { params: Promise<{ id: string }> }

/**
 * "Este brochure se mandó una vez más."
 *
 * Se llama al abrir o descargar el PDF. Es la única medición del panel y vale la
 * pena por una pregunta que si no no se puede contestar: cuál de estos
 * materiales usa alguien de verdad. Sin el contador, en un año hay treinta PDF y
 * nadie sabe cuáles cinco trabajan —ni cuáles rehacer primero cuando haya
 * presupuesto para rediseñarlos—.
 *
 * Nunca hace fallar la descarga: el cliente no espera esta respuesta. Que se
 * pierda un conteo porque se cortó internet es irrelevante; que no se abra el
 * PDF, no.
 */
export const POST = ruta("brochures descarga", async (_req: Request, ctx: Ctx) => {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const { id } = await ctx.params

  // RPC y no un update leído-y-guardado: dos personas abriendo el mismo material
  // al mismo tiempo sumarían uno solo. Ver la migración.
  const { data, error } = await supabase.rpc("brochure_descargado", { p_id: id })

  if (error) {
    console.error("[brochures descarga]", error)
    return NextResponse.json({ error: "No se pudo registrar la descarga" }, { status: 500 })
  }

  return NextResponse.json({ descargas: Number(data) || 0 })
})
