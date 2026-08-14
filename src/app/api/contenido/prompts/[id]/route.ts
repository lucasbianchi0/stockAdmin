import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"

type Contexto = { params: Promise<{ id: string }> }

/** Editar un prompt propio: nombre, descripción o cuerpo. */
export async function PATCH(req: Request, { params }: Contexto) {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const { id } = await params

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
  const cambios: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (typeof raw.nombre === "string") {
    const nombre = raw.nombre.trim().slice(0, 120)
    if (!nombre) return NextResponse.json({ error: "Poné un nombre" }, { status: 400 })
    cambios.nombre = nombre
  }
  if (typeof raw.cuerpo === "string") {
    const cuerpo = raw.cuerpo.trim().slice(0, 20000)
    if (!cuerpo) return NextResponse.json({ error: "El prompt no puede estar vacío" }, { status: 400 })
    cambios.cuerpo = cuerpo
  }
  if (typeof raw.descripcion === "string") {
    cambios.descripcion = raw.descripcion.trim().slice(0, 400) || null
  }

  const { data, error } = await supabase
    .from("content_prompts")
    .update(cambios)
    .eq("id", id)
    .select()
    .single()

  if (error || !data) {
    console.error("[contenido/prompts PATCH]", error)
    return NextResponse.json({ error: "No se pudo guardar el cambio" }, { status: 500 })
  }

  return NextResponse.json({
    prompt: {
      id: String(data.id),
      nombre: String(data.nombre ?? ""),
      descripcion: typeof data.descripcion === "string" ? data.descripcion : "",
      cuerpo: String(data.cuerpo ?? ""),
      autor: typeof data.created_by_email === "string" ? data.created_by_email : null,
      createdAt: String(data.created_at ?? ""),
    },
  })
}

/** Borrar un prompt propio. */
export async function DELETE(_req: Request, { params }: Contexto) {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const { id } = await params

  const { error } = await supabase.from("content_prompts").delete().eq("id", id)
  if (error) {
    console.error("[contenido/prompts DELETE]", error)
    return NextResponse.json({ error: "No se pudo borrar el prompt" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
