import { NextResponse } from "next/server"

import { ruta } from "@/lib/admin/ruta"
import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { createSupabaseServer } from "@/lib/supabase-server"
import { nombreDeUsuario } from "@/lib/usuario"
import {
  LIMITES,
  esCanal,
  esCircunstancia,
  llevaAsunto,
  normalizarEtiquetas,
} from "@/lib/marketing/mensajes"
import { COLUMNAS_MENSAJE, aMensaje } from "@/lib/marketing/mensajes-server"

type Ctx = { params: Promise<{ id: string }> }

/* ── PATCH · editar ───────────────────────────────────────────────────────── */

/**
 * Edita cualquiera, no solo el autor.
 *
 * Es deliberado: esto es un repertorio del equipo, no el cuaderno de cada uno.
 * Si el mensaje de cobranza tiene una frase que quedó mal, el que la detecta
 * tiene que poder arreglarla sin esperar a que vuelva de vacaciones quien la
 * escribió. Lo que sí se conserva es el crédito —el autor no cambia nunca— y se
 * agrega quién fue el último en tocarla, que es lo que hace que la edición
 * abierta no se sienta anónima.
 */
export const PATCH = ruta("mensajes PATCH", async (req: Request, ctx: Ctx) => {
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

  // Hace falta el autor para decidir si esta edición deja rastro de editor, y de
  // paso distingue "no existe" de "no se pudo guardar".
  const { data: actual } = await supabase
    .from("mensajes_plantilla")
    .select("autor_id, canal")
    .eq("id", id)
    .maybeSingle()

  if (!actual) {
    return NextResponse.json({ error: "La plantilla ya no existe" }, { status: 404 })
  }

  const cambios: Record<string, unknown> = {}

  if (typeof raw.titulo === "string") {
    const titulo = raw.titulo.trim().slice(0, LIMITES.titulo)
    if (!titulo) return NextResponse.json({ error: "Falta el título" }, { status: 400 })
    cambios.titulo = titulo
  }

  if (typeof raw.cuerpo === "string") {
    const cuerpo = raw.cuerpo.trim().slice(0, LIMITES.cuerpo)
    if (!cuerpo) return NextResponse.json({ error: "Falta el mensaje" }, { status: 400 })
    cambios.cuerpo = cuerpo
  }

  if (esCircunstancia(raw.circunstancia)) cambios.circunstancia = raw.circunstancia
  if (esCanal(raw.canal)) cambios.canal = raw.canal

  if (typeof raw.cuandoUsar === "string") {
    cambios.cuando_usar = raw.cuandoUsar.trim().slice(0, LIMITES.cuandoUsar) || null
  }

  if (Array.isArray(raw.etiquetas)) {
    cambios.etiquetas = normalizarEtiquetas(raw.etiquetas)
  }

  // El asunto se resuelve contra el canal que va a quedar, no contra el que
  // había: pasar una plantilla de mail a WhatsApp tiene que llevarse el asunto
  // puesto, o queda un campo invisible que reaparece solo.
  const canalFinal = esCanal(cambios.canal)
    ? cambios.canal
    : esCanal(actual.canal)
      ? actual.canal
      : "otro"

  if (typeof raw.asunto === "string" || cambios.canal) {
    const asunto =
      typeof raw.asunto === "string" ? raw.asunto.trim().slice(0, LIMITES.asunto) : ""
    cambios.asunto = llevaAsunto(canalFinal) ? asunto || null : null
  }

  if (Object.keys(cambios).length === 0) {
    return NextResponse.json({ error: "Nada para cambiar" }, { status: 400 })
  }

  const supabaseUsuario = await createSupabaseServer()
  const {
    data: { user },
  } = await supabaseUsuario.auth.getUser()

  // El autor editando lo suyo no es "editado por": el pie diría dos veces el
  // mismo nombre y dejaría de significar algo.
  cambios.editor_nombre =
    user && actual.autor_id === user.id ? null : nombreDeUsuario(user)

  const { data, error } = await supabase
    .from("mensajes_plantilla")
    .update(cambios)
    .eq("id", id)
    .select(COLUMNAS_MENSAJE)
    .single()

  if (error || !data) {
    console.error("[mensajes PATCH]", error)
    return NextResponse.json({ error: "No se pudo guardar" }, { status: 500 })
  }

  return NextResponse.json({ mensaje: aMensaje(data) })
})

/* ── DELETE · baja definitiva ─────────────────────────────────────────────── */

export const DELETE = ruta("mensajes DELETE", async (_req: Request, ctx: Ctx) => {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const { id } = await ctx.params

  const { error } = await supabase.from("mensajes_plantilla").delete().eq("id", id)
  if (error) {
    console.error("[mensajes DELETE]", error)
    return NextResponse.json({ error: "No se pudo borrar" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
})
