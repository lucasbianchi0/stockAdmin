import { NextResponse } from "next/server"

import { ruta } from "@/lib/admin/ruta"
import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"

type Ctx = { params: Promise<{ id: string }> }

/**
 * "Esta plantilla se usó una vez más."
 *
 * Se llama al copiar. Es la única medición del panel y vale la pena por una
 * pregunta que si no no se puede contestar: cuáles de estas plantillas usa
 * alguien de verdad. Sin el contador, en seis meses hay treinta y nadie sabe
 * cuáles cinco son las que trabajan.
 *
 * Nunca hace fallar la copia: el cliente no espera esta respuesta. Que se pierda
 * un conteo porque se cortó internet es irrelevante; que no se copie el mensaje,
 * no.
 */
export const POST = ruta("mensajes uso", async (_req: Request, ctx: Ctx) => {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const { id } = await ctx.params

  // RPC y no un update leído-y-guardado: dos personas copiando la misma
  // plantilla al mismo tiempo sumarían uno solo. Ver la migración.
  const { data, error } = await supabase.rpc("mensaje_plantilla_usado", { p_id: id })

  if (error) {
    console.error("[mensajes uso]", error)
    return NextResponse.json({ error: "No se pudo registrar el uso" }, { status: 500 })
  }

  return NextResponse.json({ usos: Number(data) || 0 })
})
