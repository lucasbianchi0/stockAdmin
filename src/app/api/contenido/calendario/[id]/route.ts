import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { BUCKET_PIEZAS } from "@/lib/piezas"
import { aPlanBase, aSlotsCliente, columnasResumen } from "@/lib/calendario-server"
import { esEstado, type Plan } from "@/lib/calendario-context"

/** Next 15 entrega los params como promesa. */
type Contexto = { params: Promise<{ id: string }> }

/* ── GET · un plan con todos sus slots ────────────────────────────────────── */

export async function GET(_req: Request, { params }: Contexto) {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const { id } = await params

  const { data: plan, error } = await supabase
    .from("content_plans")
    .select(columnasResumen)
    .eq("id", id)
    .maybeSingle()

  if (error) {
    console.error("[calendario/:id GET]", error)
    return NextResponse.json({ error: "No se pudo cargar el plan" }, { status: 500 })
  }
  if (!plan) return NextResponse.json({ error: "Ese plan no existe" }, { status: 404 })

  const { data: slots } = await supabase
    .from("content_slots")
    .select("*")
    .eq("plan_id", id)
    .order("fecha", { ascending: true })
    .order("orden", { ascending: true })

  const completo: Plan = {
    ...aPlanBase(plan),
    slots: await aSlotsCliente(slots ?? []),
  }

  return NextResponse.json({ plan: completo })
}

/* ── PATCH · renombrar y cambiar de estado ────────────────────────────────── */

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
  const raw = (body ?? {}) as Record<string, unknown>

  const cambios: Record<string, unknown> = {}

  if ("nombre" in raw) {
    // Vaciar el nombre no es un error: es volver al título que puso el modelo.
    const nombre = typeof raw.nombre === "string" ? raw.nombre.trim().slice(0, 120) : ""
    cambios.nombre = nombre || null
  }

  if ("estado" in raw) {
    if (!esEstado(raw.estado)) {
      return NextResponse.json({ error: "Estado inválido" }, { status: 400 })
    }
    cambios.estado = raw.estado
  }

  if (Object.keys(cambios).length === 0) {
    return NextResponse.json({ error: "No hay nada para cambiar" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("content_plans")
    .update(cambios)
    .eq("id", id)
    .select(columnasResumen)
    .maybeSingle()

  if (error) {
    console.error("[calendario/:id PATCH]", error)
    return NextResponse.json({ error: "No se pudo guardar el cambio" }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: "Ese plan no existe" }, { status: 404 })

  return NextResponse.json({ plan: aPlanBase(data) })
}

/* ── DELETE · borrar de verdad ────────────────────────────────────────────── */

/**
 * Borra el plan, sus slots (por el cascade) y las imágenes que había generado.
 *
 * Archivar y borrar dejaron de ser lo mismo: para esconder un plan sin perderlo
 * está `PATCH { estado: "archivado" }`, que es lo que ofrece el botón suave. Este
 * endpoint es el destructivo de verdad, y por eso también limpia el bucket — una
 * imagen sin su slot es un archivo que nadie va a volver a encontrar y que sigue
 * ocupando.
 */
export async function DELETE(_req: Request, { params }: Contexto) {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const { id } = await params

  const { data: slots } = await supabase
    .from("content_slots")
    .select("imagen_path")
    .eq("plan_id", id)
    .not("imagen_path", "is", null)

  const rutas = (slots ?? [])
    .map((s) => s.imagen_path)
    .filter((r): r is string => typeof r === "string" && r.length > 0)

  const { error } = await supabase.from("content_plans").delete().eq("id", id)
  if (error) {
    console.error("[calendario/:id DELETE]", error)
    return NextResponse.json({ error: "No se pudo borrar el plan" }, { status: 500 })
  }

  // Después de borrar la fila y no antes: si el borrado falla, las imágenes
  // todavía le pertenecen a un plan que sigue existiendo.
  if (rutas.length > 0) {
    const { error: errStorage } = await supabase.storage.from(BUCKET_PIEZAS).remove(rutas)
    // Que quede un archivo huérfano no justifica devolver un error: para el
    // usuario el plan ya no está, que es lo que pidió.
    if (errStorage) console.error("[calendario/:id DELETE storage]", errStorage)
  }

  return NextResponse.json({ ok: true })
}
