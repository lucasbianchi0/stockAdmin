import { NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { ACCEDRA_BRAND_CONTEXT, BRAND_PROMPT_MAX_LEN, sanitizeBrief, sanitizeText } from "@/lib/contenido-context"

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const VALID_SECTIONS = new Set(["caption", "captionCorto", "hashtags", "cta", "promptImagen", "guion"])

const SECTION_LABELS: Record<string, string> = {
  caption:      "caption de redes sociales",
  captionCorto: "versión corta para Story/Reel",
  hashtags:     "hashtags (con # incluido, separados por espacio)",
  cta:          "call to action",
  promptImagen: "prompt en inglés para generar la imagen con DALL-E o Midjourney",
  guion:        "guión de Reel (script de escenas, audio y texto en pantalla)",
}

export async function POST(req: Request) {
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

  const section = typeof raw.section === "string" ? raw.section : ""
  if (!VALID_SECTIONS.has(section)) {
    return NextResponse.json({ error: "Sección inválida" }, { status: 400 })
  }

  const currentContent = sanitizeBrief(raw.currentContent).slice(0, 2000)
  const instruction    = sanitizeBrief(raw.instruction).slice(0, 300)
  const context        = sanitizeBrief(raw.context).slice(0, 400)

  const customBrandRaw = sanitizeText(raw.customBrandPrompt, BRAND_PROMPT_MAX_LEN)
  const brandCtx = customBrandRaw || ACCEDRA_BRAND_CONTEXT

  if (!instruction) return NextResponse.json({ error: "Instrucción requerida" }, { status: 400 })

  const sectionLabel = SECTION_LABELS[section]

  try {
    const stream = await anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 600,
      messages: [{
        role: "user",
        content: `${brandCtx}

Contexto del post: ${context}

Tenés este ${sectionLabel}:
"""
${currentContent}
"""

El usuario pide: "${instruction}"

Reescribí ÚNICAMENTE el ${sectionLabel} aplicando ese cambio. Devolvé solo el contenido reescrito, sin explicaciones, sin separadores, sin comillas alrededor.`,
      }],
    })

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(chunk.delta.text))
          }
        }
        controller.close()
      },
    })

    return new NextResponse(readable, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
  } catch (err) {
    console.error("[contenido/refine]", err)
    return new NextResponse("Error", { status: 500 })
  }
}
