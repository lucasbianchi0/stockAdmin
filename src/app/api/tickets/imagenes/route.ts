import { NextResponse } from "next/server"

import { ruta } from "@/lib/admin/ruta"
import { exigirAlgunModulo } from "@/lib/guard-api"
import { MODULOS } from "@/lib/permisos"
import { supabase } from "@/lib/supabase"
import { createSupabaseServer } from "@/lib/supabase-server"
import { TAMANO_MAX, tipoAceptado } from "@/lib/tickets"
import { BUCKET_TICKETS, COLUMNAS_IMAGEN, conUrls } from "@/lib/tickets-server"

const PERMISO = [...MODULOS]

/**
 * Las imágenes de un ticket: la captura del error, la foto del equipo.
 *
 * El bucket es privado, así que nada se sirve por URL directa: cada listado
 * pide URLs firmadas con vencimiento corto. Una captura de pantalla de un
 * sistema interno no puede quedar accesible con sólo saber la dirección.
 */

/* ── GET · las imágenes de un ticket ──────────────────────────────────────── */

export const GET = ruta("tickets imagenes GET", async (req: Request) => {
  const sinPermiso = await exigirAlgunModulo(PERMISO)
  if (sinPermiso) return sinPermiso

  const ticketId = new URL(req.url).searchParams.get("ticketId") ?? ""
  if (!ticketId) return NextResponse.json({ error: "Falta el ticket" }, { status: 400 })

  const { data, error } = await supabase
    .from("ticket_imagenes")
    .select(COLUMNAS_IMAGEN)
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true })

  if (error) {
    console.error("[tickets imagenes GET]", error)
    return NextResponse.json({ error: "No se pudieron cargar las imágenes" }, { status: 500 })
  }

  return NextResponse.json({ imagenes: await conUrls(data ?? []) })
})

/* ── POST · subir una ────────────────────────────────────────────────────── */

export const POST = ruta("tickets imagenes POST", async (req: Request) => {
  const sinPermiso = await exigirAlgunModulo(PERMISO)
  if (sinPermiso) return sinPermiso

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 })
  }

  const ticketId = String(form.get("ticketId") ?? "")
  const archivo = form.get("archivo")

  if (!ticketId) return NextResponse.json({ error: "Falta el ticket" }, { status: 400 })
  if (!(archivo instanceof File) || archivo.size === 0) {
    return NextResponse.json({ error: "Elegí una imagen" }, { status: 400 })
  }
  if (archivo.size > TAMANO_MAX) {
    return NextResponse.json(
      { error: "La imagen pesa más de 10 MB. Sacale una captura más chica." },
      { status: 413 }
    )
  }
  if (!tipoAceptado(archivo.type)) {
    return NextResponse.json(
      { error: "Sólo se aceptan imágenes (JPG, PNG, WEBP, GIF, HEIC)." },
      { status: 415 }
    )
  }

  // Que el ticket exista antes de subir: si no, queda un archivo huérfano en
  // Storage que nadie va a borrar nunca.
  const { data: ticket } = await supabase
    .from("tickets")
    .select("id")
    .eq("id", ticketId)
    .maybeSingle()

  if (!ticket) return NextResponse.json({ error: "El ticket no existe" }, { status: 404 })

  // La ruta lleva el id del ticket adelante para que las imágenes queden
  // agrupadas, y un sufijo aleatorio para que subir dos veces "captura.png" no
  // pise la primera.
  const extension = archivo.name.includes(".") ? archivo.name.split(".").pop() : "bin"
  const rutaArchivo = `${ticketId}/${crypto.randomUUID()}.${extension}`

  const { error: errSubida } = await supabase.storage
    .from(BUCKET_TICKETS)
    .upload(rutaArchivo, archivo, { contentType: archivo.type, upsert: false })

  if (errSubida) {
    console.error("[tickets imagenes upload]", errSubida)
    return NextResponse.json({ error: "No se pudo subir la imagen" }, { status: 500 })
  }

  const supabaseUsuario = await createSupabaseServer()
  const {
    data: { user },
  } = await supabaseUsuario.auth.getUser()

  const { data, error } = await supabase
    .from("ticket_imagenes")
    .insert({
      ticket_id: ticketId,
      nombre: archivo.name.slice(0, 200),
      ruta: rutaArchivo,
      tipo_mime: archivo.type,
      tamano: archivo.size,
      created_by: user?.id ?? null,
    })
    .select(COLUMNAS_IMAGEN)
    .single()

  if (error || !data) {
    // El archivo ya está en Storage; sin la fila nadie lo va a encontrar. Se
    // borra para no dejar basura.
    await supabase.storage.from(BUCKET_TICKETS).remove([rutaArchivo])
    console.error("[tickets imagenes insert]", error)
    return NextResponse.json({ error: "No se pudo registrar la imagen" }, { status: 500 })
  }

  const [imagen] = await conUrls([data])
  return NextResponse.json({ imagen }, { status: 201 })
})
