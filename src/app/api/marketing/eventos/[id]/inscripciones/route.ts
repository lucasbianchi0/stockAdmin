import { NextResponse } from "next/server"

import { ruta } from "@/lib/admin/ruta"
import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"

type Ctx = { params: Promise<{ id: string }> }

/**
 * Los que se anotaron al evento desde el sitio, del más nuevo al más viejo.
 *
 * Sólo lectura: la inscripción la hace el sitio con `inscribir_en_evento`, que
 * controla cupo y repetidos. Borrar o editar una inscripción a mano no tiene un
 * caso de uso real todavía, y sin él no hay por qué abrir esa puerta.
 */
export const GET = ruta("inscripciones GET", async (_req: Request, ctx: Ctx) => {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const { id } = await ctx.params

  const { data, error } = await supabase
    .from("evento_inscripciones")
    .select("id, email, created_at")
    .eq("evento_id", id)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[inscripciones GET]", error)
    return NextResponse.json({ error: "No se pudieron cargar las inscripciones" }, { status: 500 })
  }

  return NextResponse.json({
    inscripciones: (data ?? []).map((f) => ({ id: String(f.id), email: String(f.email), creado: String(f.created_at) })),
  })
})
