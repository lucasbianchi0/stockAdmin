import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { TEMPLATES, templatePorId } from "@/lib/templates-pieza"
import { slugsArchivados } from "@/lib/templates-server"

type Ctx = { params: Promise<{ slug: string }> }

/* ── PATCH · archivar o restaurar un formato ──────────────────────────────── */

/**
 * Sacar un template de circulación, o volver a ponerlo.
 *
 * Va por slug y no por el uuid de la fila porque el slug es lo único que conoce
 * la pantalla: las recetas se leen del código y la fila puede no existir todavía
 * si nadie abrió la vista que las siembra.
 */
export async function PATCH(req: Request, ctx: Ctx) {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const { slug } = await ctx.params

  const template = templatePorId(slug)
  if (!template) {
    return NextResponse.json({ error: "Ese formato no existe" }, { status: 404 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }
  const activo = (body as Record<string, unknown> | null)?.activo
  if (typeof activo !== "boolean") {
    return NextResponse.json({ error: "Falta 'activo'" }, { status: 400 })
  }

  // Archivar hasta el último dejaría al calendario sin con qué armar la
  // secuencia. Se corta acá, con un mensaje, en vez de en el silencio del
  // fallback de `templatesActivos`.
  if (!activo) {
    const quedarian = await slugsArchivados()
    quedarian.add(slug)
    if (TEMPLATES.every((t) => quedarian.has(t.id))) {
      return NextResponse.json(
        { error: "Tiene que quedar al menos un formato activo" },
        { status: 400 }
      )
    }
  }

  // Update si la fila ya está sembrada, insert si no. Un upsert plano pisaría el
  // nombre y el "cuándo usar" que pueda tener editados en la base.
  const { data: fila } = await supabase
    .from("templates")
    .select("id")
    .eq("slug", slug)
    .maybeSingle()

  const { error } = fila
    ? await supabase
        .from("templates")
        .update({ activo, updated_at: new Date().toISOString() })
        .eq("id", fila.id)
    : await supabase.from("templates").insert({
        slug,
        nombre: template.nombre,
        cuando_usar: template.cuandoUsar,
        lleva_foto: template.llevaFoto,
        foto_color: template.fotoColor ?? false,
        orden: TEMPLATES.findIndex((t) => t.id === slug),
        activo,
      })

  if (error) {
    console.error("[templates PATCH]", error)
    return NextResponse.json({ error: "No se pudo guardar" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
