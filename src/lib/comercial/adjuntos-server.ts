import { NextResponse } from "next/server"

import { supabase } from "@/lib/supabase"
import { createSupabaseServer } from "@/lib/supabase-server"
import { TAMANO_MAX, tipoAceptado } from "@/lib/admin/adjuntos"
import { CLASES_ADJUNTO, type AdjuntoPresupuesto, type ClaseAdjunto } from "@/lib/comercial/presupuestos"

/**
 * El legajo de un presupuesto: los papeles que lo respaldan.
 *
 * Mismo mecanismo que los archivos de un comprobante —bucket privado, URLs
 * firmadas con vencimiento— porque es el mismo problema: un remito lleva
 * direcciones y números de serie, y una factura de compra lleva el costo. Nada
 * de eso puede quedar accesible con solo saber la dirección del archivo.
 *
 * Lo que agrega sobre los de comprobantes es la clase. Un legajo con doce PDF
 * llamados "documento.pdf" no sirve para lo que se pide de él: encontrar la
 * factura donde está el número de serie, meses después. Clasificarlos al subir
 * cuesta un click y es lo que hace que la lista se pueda leer.
 */

const BUCKET = "presupuestos"
const VENCIMIENTO_S = 3600

type Fila = {
  id: string
  nombre: string
  ruta: string
  tipo_mime: string | null
  tamano: number | null
  clase: string
  created_at: string
}

async function conUrls(filas: Fila[]): Promise<AdjuntoPresupuesto[]> {
  if (filas.length === 0) return []

  const { data: firmadas } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(
      filas.map((f) => f.ruta),
      VENCIMIENTO_S
    )

  const porRuta = new Map((firmadas ?? []).map((f) => [f.path, f.signedUrl]))

  return filas.map((f) => ({
    id: f.id,
    nombre: f.nombre,
    tipoMime: f.tipo_mime,
    tamano: f.tamano,
    clase: (CLASES_ADJUNTO.includes(f.clase as ClaseAdjunto) ? f.clase : "otro") as ClaseAdjunto,
    createdAt: f.created_at,
    url: porRuta.get(f.ruta) ?? null,
  }))
}

export async function listarAdjuntos(presupuestoId: string) {
  const { data, error } = await supabase
    .from("presupuesto_adjuntos")
    .select("id, nombre, ruta, tipo_mime, tamano, clase, created_at")
    .eq("presupuesto_id", presupuestoId)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[presupuesto adjuntos GET]", error)
    return NextResponse.json({ error: "No se pudieron cargar los archivos" }, { status: 500 })
  }

  return NextResponse.json({ adjuntos: await conUrls((data ?? []) as Fila[]) })
}

export async function subirAdjunto(req: Request, presupuestoId: string) {
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 })
  }

  const archivo = form.get("archivo")
  const claveClase = String(form.get("clase") ?? "otro")
  const clase = (CLASES_ADJUNTO.includes(claveClase as ClaseAdjunto)
    ? claveClase
    : "otro") as ClaseAdjunto

  if (!(archivo instanceof File) || archivo.size === 0) {
    return NextResponse.json({ error: "Elegí un archivo" }, { status: 400 })
  }
  if (archivo.size > TAMANO_MAX) {
    return NextResponse.json(
      { error: "El archivo pesa más de 15 MB. Comprimí el PDF o sacá una foto más chica." },
      { status: 413 }
    )
  }
  if (!tipoAceptado(archivo.type)) {
    return NextResponse.json(
      { error: "Solo se aceptan PDF e imágenes (JPG, PNG, WEBP, HEIC)." },
      { status: 415 }
    )
  }

  // Que el presupuesto exista antes de subir: si no, queda un archivo huérfano
  // en Storage que nadie va a borrar nunca.
  const { data: presupuesto } = await supabase
    .from("presupuestos")
    .select("id")
    .eq("id", presupuestoId)
    .maybeSingle()

  if (!presupuesto) {
    return NextResponse.json({ error: "El presupuesto no existe" }, { status: 404 })
  }

  const extension = archivo.name.includes(".") ? archivo.name.split(".").pop() : "bin"
  const ruta = `${presupuestoId}/${crypto.randomUUID()}.${extension}`

  const { error: errSubida } = await supabase.storage
    .from(BUCKET)
    .upload(ruta, archivo, { contentType: archivo.type, upsert: false })

  if (errSubida) {
    console.error("[presupuesto adjunto upload]", errSubida)
    return NextResponse.json({ error: "No se pudo subir el archivo" }, { status: 500 })
  }

  const supabaseUsuario = await createSupabaseServer()
  const {
    data: { user },
  } = await supabaseUsuario.auth.getUser()

  const { data, error } = await supabase
    .from("presupuesto_adjuntos")
    .insert({
      presupuesto_id: presupuestoId,
      nombre: archivo.name.slice(0, 200),
      ruta,
      tipo_mime: archivo.type,
      tamano: archivo.size,
      clase,
      created_by: user?.id ?? null,
    })
    .select("id, nombre, ruta, tipo_mime, tamano, clase, created_at")
    .single()

  if (error || !data) {
    // El archivo ya está en Storage; sin la fila nadie lo va a encontrar.
    await supabase.storage.from(BUCKET).remove([ruta])
    console.error("[presupuesto adjunto insert]", error)
    return NextResponse.json({ error: "No se pudo registrar el archivo" }, { status: 500 })
  }

  const [adjunto] = await conUrls([data as Fila])
  return NextResponse.json({ adjunto }, { status: 201 })
}

export async function borrarAdjunto(id: string) {
  const { data, error } = await supabase
    .from("presupuesto_adjuntos")
    .select("id, ruta")
    .eq("id", id)
    .maybeSingle()

  if (error) {
    console.error("[presupuesto adjunto leer]", error)
    return NextResponse.json({ error: "No se pudo borrar el archivo" }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: "El archivo no existe" }, { status: 404 })

  // Primero la fila y después el archivo: al revés, si falla el borrado de la
  // fila queda una entrada que apunta a un archivo que ya no está.
  const { error: errFila } = await supabase.from("presupuesto_adjuntos").delete().eq("id", id)
  if (errFila) {
    console.error("[presupuesto adjunto borrar]", errFila)
    return NextResponse.json({ error: "No se pudo borrar el archivo" }, { status: 500 })
  }

  await supabase.storage.from(BUCKET).remove([data.ruta as string])
  return NextResponse.json({ ok: true })
}
