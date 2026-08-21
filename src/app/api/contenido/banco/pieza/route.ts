import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { BUCKET_PIEZAS } from "@/lib/piezas"
import { CAMPOS_EDITABLES } from "@/lib/banco-context"
import { aPiezasBanco, columnasPieza } from "@/lib/banco-server"
import { sanitizeText, type Contenido } from "@/lib/calendario-context"

/**
 * Editar y descartar una pieza del banco.
 *
 * La edición es de COPY y nada más: caption, versión corta, hashtags y CTA. El
 * titular queda afuera porque ya está impreso dentro del JPG — dejarlo editable
 * haría que el texto del post y el de la imagen digan cosas distintas sin que
 * nada lo avise. Para cambiar el titular hay que regenerar la pieza.
 */

/* ── PATCH · guardar el copy editado ──────────────────────────────────────── */

export async function PATCH(req: Request) {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const raw = await leerBody(req)
  if (!raw) return NextResponse.json({ error: "Body inválido" }, { status: 400 })

  const piezaId = typeof raw.piezaId === "string" ? raw.piezaId : null
  if (!piezaId) return NextResponse.json({ error: "Falta la pieza" }, { status: 400 })

  const cambios = (raw.contenido ?? null) as Record<string, unknown> | null
  if (!cambios || typeof cambios !== "object") {
    return NextResponse.json({ error: "Mandá el contenido" }, { status: 400 })
  }

  const { data: fila } = await supabase
    .from("content_slots")
    .select("id, contenido, origen")
    .eq("id", piezaId)
    .maybeSingle()

  if (!fila) return NextResponse.json({ error: "La pieza no existe" }, { status: 404 })
  if (fila.origen !== "banco") {
    // Esta ruta no toca el calendario viejo. Que el error sea explícito y no un
    // update silencioso: son dos flujos y mezclarlos es cómo se rompe uno.
    return NextResponse.json({ error: "Esa pieza no es del banco" }, { status: 400 })
  }

  const actual = (fila.contenido ?? null) as Contenido | null
  if (!actual) {
    return NextResponse.json({ error: "La pieza todavía no tiene copy" }, { status: 400 })
  }

  /*
   * Solo se pisan los campos que llegaron.
   *
   * Un PATCH que reemplace el objeto entero borraría `promptImagen` —que el
   * formulario no muestra— y con él la trazabilidad de con qué se generó la
   * imagen. El campo no se edita, pero tampoco se pierde.
   */
  const contenido: Contenido = { ...actual }
  for (const campo of CAMPOS_EDITABLES) {
    if (typeof cambios[campo.id] !== "string") continue
    contenido[campo.id] = sanitizeText(cambios[campo.id], campo.max)
  }

  const { data, error } = await supabase
    .from("content_slots")
    .update({ contenido, updated_at: new Date().toISOString() })
    .eq("id", piezaId)
    .select(columnasPieza)
    .single()

  if (error || !data) {
    console.error("[banco/pieza PATCH]", error)
    return NextResponse.json({ error: "No se pudo guardar" }, { status: 500 })
  }

  const [pieza] = await aPiezasBanco([data])
  return NextResponse.json({ pieza })
}

/* ── DELETE · descartar ───────────────────────────────────────────────────── */

/**
 * Descarta una pieza del banco, con su imagen.
 *
 * Descartar es la mitad del trabajo de revisar un lote: de ocho piezas, una o
 * dos no van, y dejarlas ahí "por si acaso" convierte el banco en un depósito.
 * El archivo del bucket se borra con la fila — un JPG sin fila que lo apunte es
 * basura inalcanzable que igual se paga.
 */
export async function DELETE(req: Request) {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const raw = await leerBody(req)
  if (!raw) return NextResponse.json({ error: "Body inválido" }, { status: 400 })

  const piezaId = typeof raw.piezaId === "string" ? raw.piezaId : null
  if (!piezaId) return NextResponse.json({ error: "Falta la pieza" }, { status: 400 })

  const { data: fila } = await supabase
    .from("content_slots")
    .select("id, origen, imagen_path")
    .eq("id", piezaId)
    .maybeSingle()

  if (!fila) return NextResponse.json({ ok: true })
  if (fila.origen !== "banco") {
    return NextResponse.json({ error: "Esa pieza no es del banco" }, { status: 400 })
  }

  const { error } = await supabase.from("content_slots").delete().eq("id", piezaId)
  if (error) {
    console.error("[banco/pieza DELETE]", error)
    return NextResponse.json({ error: "No se pudo descartar" }, { status: 500 })
  }

  // Después de borrar la fila y no antes: si el borrado del archivo falla, queda
  // un huérfano; si fallara al revés, quedaría una tarjeta con la miniatura rota.
  const ruta = typeof fila.imagen_path === "string" ? fila.imagen_path : null
  if (ruta) {
    const { error: errArchivo } = await supabase.storage.from(BUCKET_PIEZAS).remove([ruta])
    if (errArchivo) console.error("[banco/pieza DELETE archivo]", errArchivo)
  }

  return NextResponse.json({ ok: true })
}

async function leerBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json()
    if (!body || typeof body !== "object" || Array.isArray(body)) return null
    return body as Record<string, unknown>
  } catch {
    return null
  }
}
