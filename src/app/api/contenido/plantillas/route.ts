import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { createSupabaseServer } from "@/lib/supabase-server"
import {
  BUCKET_PLANTILLAS,
  PLANTILLA_MAX_BYTES,
  esMimeValido,
  extensionDe,
  type Plantilla,
} from "@/lib/plantillas"

/** Las URLs firmadas duran lo que una sesión de trabajo, no más. */
const FIRMA_SEGUNDOS = 60 * 60

/* ── GET · listado ────────────────────────────────────────────────────────── */

export async function GET(req: Request) {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const soloActivas = new URL(req.url).searchParams.get("activas") === "1"

  let query = supabase.from("plantillas").select("*").order("orden").order("created_at")
  if (soloActivas) query = query.eq("activa", true)

  const { data, error } = await query
  if (error) {
    console.error("[plantillas GET]", error)
    return NextResponse.json({ error: "No se pudieron cargar las plantillas" }, { status: 500 })
  }

  const plantillas = await Promise.all((data ?? []).map(aPlantilla))
  return NextResponse.json({ plantillas })
}

/* ── POST · subida ────────────────────────────────────────────────────────── */

export async function POST(req: Request) {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: "Se esperaba un formulario" }, { status: 400 })
  }

  const archivo = form.get("archivo")
  if (!(archivo instanceof File)) {
    return NextResponse.json({ error: "Falta el archivo" }, { status: 400 })
  }
  if (!esMimeValido(archivo.type)) {
    return NextResponse.json({ error: "Tiene que ser JPG, PNG o WebP" }, { status: 400 })
  }
  if (archivo.size > PLANTILLA_MAX_BYTES) {
    return NextResponse.json({ error: "El archivo supera los 5 MB" }, { status: 400 })
  }

  const nombre = String(form.get("nombre") ?? "").trim().slice(0, 120) || archivo.name
  const cuandoUsar = String(form.get("cuandoUsar") ?? "").trim().slice(0, 500) || null
  const composicion = String(form.get("composicion") ?? "").trim().slice(0, 3000) || null

  // El bucket se crea solo la primera vez. Pedirle a alguien que entre al panel
  // de Supabase a crearlo antes de poder subir nada es un paso que se olvida.
  await supabase.storage.createBucket(BUCKET_PLANTILLAS, { public: false }).catch(() => {})

  const ruta = `${crypto.randomUUID()}.${extensionDe(archivo.type)}`
  const { error: errSubida } = await supabase.storage
    .from(BUCKET_PLANTILLAS)
    .upload(ruta, await archivo.arrayBuffer(), { contentType: archivo.type, upsert: false })

  if (errSubida) {
    console.error("[plantillas POST storage]", errSubida)
    return NextResponse.json({ error: "No se pudo subir el archivo" }, { status: 500 })
  }

  const supabaseUsuario = await createSupabaseServer()
  const {
    data: { user },
  } = await supabaseUsuario.auth.getUser()

  const { data, error } = await supabase
    .from("plantillas")
    .insert({
      nombre,
      cuando_usar: cuandoUsar,
      composicion,
      storage_path: ruta,
      mime_type: archivo.type,
      created_by: user?.id ?? null,
    })
    .select()
    .single()

  if (error || !data) {
    // Sin fila, el archivo queda huérfano ocupando lugar y sin forma de llegar
    // a él: se borra en el mismo request.
    await supabase.storage.from(BUCKET_PLANTILLAS).remove([ruta])
    console.error("[plantillas POST]", error)
    return NextResponse.json({ error: "No se pudo guardar la plantilla" }, { status: 500 })
  }

  return NextResponse.json({ plantilla: await aPlantilla(data) }, { status: 201 })
}

/* ── Mapeo ────────────────────────────────────────────────────────────────── */

type Fila = Record<string, unknown>

async function aPlantilla(fila: Fila): Promise<Plantilla> {
  const ruta = String(fila.storage_path)
  const { data } = await supabase.storage
    .from(BUCKET_PLANTILLAS)
    .createSignedUrl(ruta, FIRMA_SEGUNDOS)

  return {
    id: String(fila.id),
    nombre: String(fila.nombre),
    cuandoUsar: (fila.cuando_usar as string | null) ?? null,
    composicion: (fila.composicion as string | null) ?? null,
    activa: fila.activa !== false,
    orden: Number(fila.orden ?? 0),
    url: data?.signedUrl ?? null,
  }
}
