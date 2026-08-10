import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { createSupabaseServer } from "@/lib/supabase-server"
import { BUCKET_PIEZAS, type PiezaGenerada } from "@/lib/piezas"

const FIRMA_SEGUNDOS = 60 * 60

/* ── GET · historial ──────────────────────────────────────────────────────── */

export async function GET(req: Request) {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const url = new URL(req.url)
  const templateId = url.searchParams.get("templateId")
  const limite = Math.min(60, Math.max(1, Number(url.searchParams.get("limite")) || 30))

  let query = supabase
    .from("piezas_generadas")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limite)

  if (templateId) query = query.eq("template_id", templateId)

  const { data, error } = await query
  if (error) {
    console.error("[piezas GET]", error)
    return NextResponse.json({ error: "No se pudo cargar el historial" }, { status: 500 })
  }

  const piezas = await Promise.all((data ?? []).map(aPieza))
  return NextResponse.json({ piezas })
}

/* ── POST · guardar una versión ───────────────────────────────────────────── */

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

  const imagen = typeof raw.imagen === "string" ? raw.imagen : ""
  const coincide = imagen.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/)
  if (!coincide) {
    return NextResponse.json({ error: "Falta la imagen" }, { status: 400 })
  }
  const [, mime, base64] = coincide

  const texto = (k: string, max: number) =>
    typeof raw[k] === "string" ? (raw[k] as string).trim().slice(0, max) : ""

  const templateId = texto("templateId", 60)
  const titular = texto("titular", 300)
  const prompt = texto("prompt", 8000)
  if (!templateId || !titular || !prompt) {
    return NextResponse.json({ error: "Faltan datos de la pieza" }, { status: 400 })
  }

  // El número del lote lo decide el servidor, no el cliente: si lo mandara el
  // navegador, dos pestañas generando a la vez pisarían el mismo número.
  const loteId = typeof raw.loteId === "string" ? raw.loteId : null
  let loteNumero: number | null = null

  if (loteId) {
    const { data: mismo } = await supabase
      .from("piezas_generadas")
      .select("lote_numero")
      .eq("lote_id", loteId)
      .limit(1)
      .maybeSingle()

    if (mismo?.lote_numero) {
      loteNumero = mismo.lote_numero
    } else {
      const { data: ultimo } = await supabase
        .from("piezas_generadas")
        .select("lote_numero")
        .order("lote_numero", { ascending: false })
        .limit(1)
        .maybeSingle()
      loteNumero = (ultimo?.lote_numero ?? 0) + 1
    }
  }

  await supabase.storage.createBucket(BUCKET_PIEZAS, { public: false }).catch(() => {})

  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg"
  const ruta = `${templateId}/${crypto.randomUUID()}.${ext}`

  const { error: errSubida } = await supabase.storage
    .from(BUCKET_PIEZAS)
    .upload(ruta, Buffer.from(base64, "base64"), { contentType: mime, upsert: false })

  if (errSubida) {
    console.error("[piezas POST storage]", errSubida)
    return NextResponse.json({ error: "No se pudo guardar la imagen" }, { status: 500 })
  }

  const supabaseUsuario = await createSupabaseServer()
  const {
    data: { user },
  } = await supabaseUsuario.auth.getUser()

  const { data, error } = await supabase
    .from("piezas_generadas")
    .insert({
      template_id: templateId,
      template_nombre: texto("templateNombre", 120) || null,
      titular,
      etiqueta: texto("etiqueta", 60) || null,
      sujeto: texto("sujeto", 500) || null,
      prompt,
      modelo: texto("modelo", 60) || null,
      lote_id: loteId,
      lote_numero: loteNumero,
      storage_path: ruta,
      mime_type: mime,
      created_by: user?.id ?? null,
    })
    .select()
    .single()

  if (error || !data) {
    // Igual que en plantillas: sin fila el archivo es basura inalcanzable.
    await supabase.storage.from(BUCKET_PIEZAS).remove([ruta])
    console.error("[piezas POST]", error)
    return NextResponse.json({ error: "No se pudo guardar la pieza" }, { status: 500 })
  }

  return NextResponse.json({ pieza: await aPieza(data) }, { status: 201 })
}

/* ── Mapeo ────────────────────────────────────────────────────────────────── */

async function aPieza(fila: Record<string, unknown>): Promise<PiezaGenerada> {
  const { data } = await supabase.storage
    .from(BUCKET_PIEZAS)
    .createSignedUrl(String(fila.storage_path), FIRMA_SEGUNDOS)

  return {
    id: String(fila.id),
    templateId: String(fila.template_id),
    templateNombre: (fila.template_nombre as string | null) ?? null,
    titular: String(fila.titular),
    etiqueta: (fila.etiqueta as string | null) ?? null,
    sujeto: (fila.sujeto as string | null) ?? null,
    prompt: String(fila.prompt),
    modelo: (fila.modelo as string | null) ?? null,
    loteNumero: (fila.lote_numero as number | null) ?? null,
    createdAt: String(fila.created_at),
    url: data?.signedUrl ?? null,
  }
}
