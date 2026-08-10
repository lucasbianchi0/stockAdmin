import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { BUCKET_PIEZAS } from "@/lib/piezas"
import { aSlotsCliente } from "@/lib/calendario-server"

/**
 * La imagen de una pieza del calendario, persistida.
 *
 * Hasta acá la imagen vivía en un `useState` del navegador: recargar la pestaña
 * tiraba a la basura cuatro minutos de generación, y no había forma de volver a
 * un plan de la semana pasada y ver qué había salido.
 *
 * Se guarda la ruta y no el base64. Son ~600 KB por pieza y `content_slots` se
 * lee entera cada vez que se abre un plan: con once piezas, meter las imágenes
 * en la fila serían siete megas por pantallazo.
 */

const MAX_BYTES = 8 * 1024 * 1024

export async function POST(req: Request) {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }
  const raw = (body ?? {}) as Record<string, unknown>

  const slotId = typeof raw.slotId === "string" ? raw.slotId : null
  if (!slotId) return NextResponse.json({ error: "Falta el slot" }, { status: 400 })

  const imagen = typeof raw.imagen === "string" ? raw.imagen : ""
  const coincide = imagen.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/)
  if (!coincide) return NextResponse.json({ error: "Falta la imagen" }, { status: 400 })

  const [, mime, base64] = coincide
  const bytes = Buffer.from(base64, "base64")
  if (bytes.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "La imagen es demasiado grande" }, { status: 413 })
  }

  const { data: slot } = await supabase
    .from("content_slots")
    .select("id, plan_id, imagen_path")
    .eq("id", slotId)
    .maybeSingle()

  if (!slot) return NextResponse.json({ error: "Slot inexistente" }, { status: 404 })

  await supabase.storage.createBucket(BUCKET_PIEZAS, { public: false }).catch(() => {})

  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg"
  // Nombre nuevo en cada subida en vez de pisar el anterior: las URLs firmadas
  // que ya estén dando vueltas seguirían apuntando al archivo viejo y el
  // navegador cachearía la imagen anterior con la ruta nueva.
  const ruta = `calendario/${slot.plan_id}/${slotId}-${crypto.randomUUID()}.${ext}`

  const { error: errSubida } = await supabase.storage
    .from(BUCKET_PIEZAS)
    .upload(ruta, bytes, { contentType: mime, upsert: false })

  if (errSubida) {
    console.error("[calendario/slot/imagen upload]", errSubida)
    return NextResponse.json({ error: "No se pudo guardar la imagen" }, { status: 500 })
  }

  const { data, error } = await supabase
    .from("content_slots")
    .update({ imagen_path: ruta, updated_at: new Date().toISOString() })
    .eq("id", slotId)
    .select()
    .single()

  if (error || !data) {
    // Sin la fila apuntando al archivo, el archivo es basura inalcanzable.
    await supabase.storage.from(BUCKET_PIEZAS).remove([ruta])
    console.error("[calendario/slot/imagen update]", error)
    return NextResponse.json({ error: "No se pudo guardar la imagen" }, { status: 500 })
  }

  // La anterior se borra recién cuando la nueva ya quedó apuntada: al revés, un
  // fallo en el medio deja la pieza sin ninguna de las dos.
  const anterior = typeof slot.imagen_path === "string" ? slot.imagen_path : null
  if (anterior && anterior !== ruta) {
    const { error: errBorrado } = await supabase.storage.from(BUCKET_PIEZAS).remove([anterior])
    if (errBorrado) console.error("[calendario/slot/imagen remove]", errBorrado)
  }

  const [actualizado] = await aSlotsCliente([data])
  return NextResponse.json({ slot: actualizado })
}
