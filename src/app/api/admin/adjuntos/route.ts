import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { createSupabaseServer } from "@/lib/supabase-server"
import { ruta } from "@/lib/admin/ruta"
import { TAMANO_MAX, tipoAceptado, type Adjunto } from "@/lib/admin/adjuntos"

/**
 * Los archivos de un comprobante.
 *
 * El bucket es privado, así que nada se sirve por URL directa: cada listado pide
 * URLs firmadas con vencimiento corto. Un comprobante tiene CUIT, razón social e
 * importes — no puede quedar accesible con solo saber la dirección.
 */

const BUCKET = "comprobantes"
/** Una hora. Alcanza de sobra para abrir o descargar, y si la pestaña queda
 *  abierta toda la tarde el enlace ya no sirve. */
const VENCIMIENTO_S = 3600

/** Las URL firmadas de una tanda de archivos, en un solo pedido. */
async function conUrls(
  filas: { id: string; nombre: string; ruta: string; tipo_mime: string | null; tamano: number | null; created_at: string }[]
): Promise<Adjunto[]> {
  if (filas.length === 0) return []

  const { data: firmadas } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(filas.map((f) => f.ruta), VENCIMIENTO_S)

  const porRuta = new Map((firmadas ?? []).map((f) => [f.path, f.signedUrl]))

  return filas.map((f) => ({
    id: f.id,
    nombre: f.nombre,
    tipoMime: f.tipo_mime,
    tamano: f.tamano,
    createdAt: f.created_at,
    url: porRuta.get(f.ruta) ?? null,
  }))
}

export const GET = ruta("adjuntos GET", async (req: Request) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso

  const comprobanteId = new URL(req.url).searchParams.get("comprobanteId") ?? ""
  if (!comprobanteId) {
    return NextResponse.json({ error: "Falta el comprobante" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("comprobante_adjuntos")
    .select("id, nombre, ruta, tipo_mime, tamano, created_at")
    .eq("comprobante_id", comprobanteId)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[adjuntos GET]", error)
    return NextResponse.json({ error: "No se pudieron cargar los archivos" }, { status: 500 })
  }

  return NextResponse.json({ adjuntos: await conUrls(data ?? []) })
})

export const POST = ruta("adjuntos POST", async (req: Request) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 })
  }

  const comprobanteId = String(form.get("comprobanteId") ?? "")
  const archivo = form.get("archivo")

  if (!comprobanteId) {
    return NextResponse.json({ error: "Falta el comprobante" }, { status: 400 })
  }
  if (!(archivo instanceof File) || archivo.size === 0) {
    return NextResponse.json({ error: "Elegí un archivo" }, { status: 400 })
  }
  if (archivo.size > TAMANO_MAX) {
    return NextResponse.json(
      { error: "El archivo pesa más de 15 MB. Sacale una foto más chica o comprimí el PDF." },
      { status: 413 }
    )
  }
  if (!tipoAceptado(archivo.type)) {
    return NextResponse.json(
      { error: "Solo se aceptan PDF e imágenes (JPG, PNG, WEBP, HEIC)." },
      { status: 415 }
    )
  }

  // Que el comprobante exista antes de subir: si no, queda un archivo huérfano
  // en Storage que nadie va a borrar nunca.
  const { data: comprobante } = await supabase
    .from("comprobantes")
    .select("id")
    .eq("id", comprobanteId)
    .maybeSingle()

  if (!comprobante) {
    return NextResponse.json({ error: "El comprobante no existe" }, { status: 404 })
  }

  // La ruta lleva el id del comprobante adelante para que los archivos queden
  // agrupados, y un sufijo aleatorio para que subir dos veces "factura.pdf" no
  // pise el primero.
  const extension = archivo.name.includes(".") ? archivo.name.split(".").pop() : "bin"
  const ruta = `${comprobanteId}/${crypto.randomUUID()}.${extension}`

  const { error: errSubida } = await supabase.storage
    .from(BUCKET)
    .upload(ruta, archivo, { contentType: archivo.type, upsert: false })

  if (errSubida) {
    console.error("[adjuntos upload]", errSubida)
    return NextResponse.json({ error: "No se pudo subir el archivo" }, { status: 500 })
  }

  const supabaseUsuario = await createSupabaseServer()
  const {
    data: { user },
  } = await supabaseUsuario.auth.getUser()

  const { data, error } = await supabase
    .from("comprobante_adjuntos")
    .insert({
      comprobante_id: comprobanteId,
      nombre: archivo.name.slice(0, 200),
      ruta,
      tipo_mime: archivo.type,
      tamano: archivo.size,
      created_by: user?.id ?? null,
    })
    .select("id, nombre, ruta, tipo_mime, tamano, created_at")
    .single()

  if (error || !data) {
    // El archivo ya está en Storage; sin la fila nadie lo va a encontrar. Se
    // borra para no dejar basura.
    await supabase.storage.from(BUCKET).remove([ruta])
    console.error("[adjuntos insert]", error)
    return NextResponse.json({ error: "No se pudo registrar el archivo" }, { status: 500 })
  }

  const [adjunto] = await conUrls([data])
  return NextResponse.json({ adjunto }, { status: 201 })
})
