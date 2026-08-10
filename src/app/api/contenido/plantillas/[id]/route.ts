import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { BUCKET_PLANTILLAS } from "@/lib/plantillas"

type Ctx = { params: Promise<{ id: string }> }

/* ── PATCH · activar o desactivar ─────────────────────────────────────────── */

export async function PATCH(req: Request, ctx: Ctx) {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const { id } = await ctx.params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }
  const raw = (body ?? {}) as Record<string, unknown>

  const cambios: Record<string, unknown> = {}
  if (typeof raw.activa === "boolean") cambios.activa = raw.activa
  if (typeof raw.nombre === "string") cambios.nombre = raw.nombre.trim().slice(0, 120)
  if (typeof raw.cuandoUsar === "string") {
    cambios.cuando_usar = raw.cuandoUsar.trim().slice(0, 500) || null
  }
  if (Object.keys(cambios).length === 0) {
    return NextResponse.json({ error: "Nada para cambiar" }, { status: 400 })
  }

  const { error } = await supabase.from("plantillas").update(cambios).eq("id", id)
  if (error) {
    console.error("[plantillas PATCH]", error)
    return NextResponse.json({ error: "No se pudo actualizar" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

/* ── DELETE · baja definitiva ─────────────────────────────────────────────── */

export async function DELETE(_req: Request, ctx: Ctx) {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const { id } = await ctx.params

  const { data } = await supabase
    .from("plantillas")
    .select("storage_path")
    .eq("id", id)
    .maybeSingle()

  const { error } = await supabase.from("plantillas").delete().eq("id", id)
  if (error) {
    console.error("[plantillas DELETE]", error)
    return NextResponse.json({ error: "No se pudo borrar" }, { status: 500 })
  }

  // El archivo después de la fila: si falla el borrado del archivo queda basura
  // en el bucket, molesto pero inofensivo. Al revés queda una plantilla que
  // apunta a un archivo que ya no existe, y eso rompe cada listado.
  if (data?.storage_path) {
    await supabase.storage.from(BUCKET_PLANTILLAS).remove([String(data.storage_path)])
  }

  return NextResponse.json({ ok: true })
}
