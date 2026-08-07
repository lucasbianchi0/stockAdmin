import { exigirModulo } from "@/lib/guard-api"
import { NextResponse } from "next/server"
import OpenAI from "openai"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// ─── Locked brand style layer ───────────────────────────────────────────────
// Appended to EVERY image so the whole feed (and every carousel) shares one
// visual system. Only the concept layer (the caller's prompt) varies.
const STYLE_SUFFIX = `

— ESTILO DE MARCA ACCEDRA (aplicar idéntico en toda la serie) —
Estética corporate tech premium para Accedra, empresa argentina de tecnología B2B (IT). Sistema visual consistente en todas las imágenes:
- Fondo limpio: gris muy claro #F4F6F9 o azul profundo #0B1628 (elegí uno coherente con la serie).
- Un único color de acento: azul Accedra #2B6AC8. Nunca otros colores vivos.
- Mucho espacio en blanco, composición ordenada y calma, sujeto centrado o en regla de tercios.
- Luz pareja y suave, sombras sutiles, acabado mate, sin degradados estridentes.
- Tipografía sans-serif moderna (estilo Inter), poco texto.
- Wordmark "Accedra" pequeño abajo a la derecha con "accedra.com.ar" debajo, sutil, nunca protagonista.
- Look profesional, confiable, enterprise — referencia Microsoft / IBM / Linear.
- Sin clichés de banco de imágenes, sin saturar, fotorrealista o vector limpio según el concepto.`

type SizeKind = "square" | "portrait" | "landscape"

const GPT_SIZE: Record<SizeKind, "1024x1024" | "1024x1536" | "1536x1024"> = {
  square: "1024x1024",
  portrait: "1024x1536",
  landscape: "1536x1024",
}

export async function POST(req: Request) {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }

  const raw = body as Record<string, unknown>

  const concept = typeof raw.prompt === "string" ? raw.prompt.trim().slice(0, 3500) : ""
  if (!concept) {
    return NextResponse.json({ error: "Prompt requerido" }, { status: 400 })
  }

  const sizeKind: SizeKind =
    raw.size === "portrait" || raw.size === "landscape" ? raw.size : "square"

  // Carousel continuity note (keeps the slides looking like one set).
  let seriesNote = ""
  if (raw.carousel && typeof raw.carousel === "object" && !Array.isArray(raw.carousel)) {
    const c = raw.carousel as Record<string, unknown>
    const index = typeof c.index === "number" ? c.index : null
    const total = typeof c.total === "number" ? c.total : null
    if (index && total) {
      seriesNote = `\n\nEsta es la slide ${index} de ${total} de un carrusel cohesivo: mantené EXACTAMENTE el mismo layout, fondo y sistema de estilo que el resto de las slides, variando solo el concepto de esta.`
    }
  }

  const finalPrompt = `${concept}${seriesNote}${STYLE_SUFFIX}`

  async function generate(model: "gpt-image-1" | "gpt-image-1-mini"): Promise<string> {
    const result = await openai.images.generate({ model, prompt: finalPrompt, size: GPT_SIZE[sizeKind], n: 1 })
    const b64 = result.data?.[0]?.b64_json
    if (!b64) throw new Error("Sin imagen en la respuesta")
    return `data:image/png;base64,${b64}`
  }

  try {
    const image = await generate("gpt-image-1")
    return NextResponse.json({ image, model: "gpt-image-1" })
  } catch (primaryErr) {
    console.warn("[contenido/image] gpt-image-1 falló, probando gpt-image-1-mini", primaryErr)
    try {
      const image = await generate("gpt-image-1-mini")
      return NextResponse.json({ image, model: "gpt-image-1-mini" })
    } catch (fallbackErr) {
      console.error("[contenido/image]", fallbackErr)
      return NextResponse.json({ error: "Error al generar la imagen" }, { status: 500 })
    }
  }
}
