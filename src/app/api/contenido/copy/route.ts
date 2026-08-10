import { exigirModulo } from "@/lib/guard-api"
import { NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import {
  ACCEDRA_BRAND_CONTEXT,
  PLATFORM_LABELS,
  AUDIENCE_LABELS,
  OBJECTIVE_LABELS,
  VALID_PLATFORMS,
  VALID_AUDIENCES,
  VALID_OBJECTIVES,
  REEL_FORMATS,
  MAX_SLIDES,
  MIN_SLIDES,
  DEFAULT_SLIDES,
  BRAND_PROMPT_MAX_LEN,
  sanitizeBrief,
  sanitizeText,
} from "@/lib/contenido-context"
import { IMAGE_PROMPT_BASE } from "@/lib/contenido-context"

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const VALID_IDEA_FORMATS = new Set(["imagen", "carrusel", "reel", "story", "articulo"])

// Shared visual base for image prompts (English, for DALL-E / Midjourney).
// Sale del Brand Kit: los hex escritos a mano acá se quedaron con el azul viejo.
const VISUAL_BASE = IMAGE_PROMPT_BASE

export async function POST(req: Request) {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }

  const raw = body as Record<string, unknown>
  const { idea, platform, audience, objective, brief } = raw

  if (!VALID_PLATFORMS.has(platform as string))  return NextResponse.json({ error: "Plataforma inválida" },  { status: 400 })
  if (!VALID_AUDIENCES.has(audience as string))  return NextResponse.json({ error: "Audiencia inválida" },   { status: 400 })
  if (!VALID_OBJECTIVES.has(objective as string)) return NextResponse.json({ error: "Objetivo inválido" }, { status: 400 })
  if (!idea || typeof idea !== "object" || Array.isArray(idea)) {
    return NextResponse.json({ error: "Idea inválida" }, { status: 400 })
  }

  const ideaObj = idea as Record<string, unknown>
  const title  = typeof ideaObj.title  === "string" ? ideaObj.title.slice(0, 200)  : ""
  const angle  = typeof ideaObj.angle  === "string" ? ideaObj.angle.slice(0, 300)  : ""
  const hook   = typeof ideaObj.hook   === "string" ? ideaObj.hook.slice(0, 200)   : ""
  const format = typeof ideaObj.format === "string" && VALID_IDEA_FORMATS.has(ideaObj.format)
    ? ideaObj.format
    : "imagen"

  if (!title) return NextResponse.json({ error: "Idea inválida" }, { status: 400 })

  // Format-specific params
  const isReel     = REEL_FORMATS.has(format)
  const isCarrusel = format === "carrusel"

  const slideCountRaw = typeof raw.slideCount === "number" ? raw.slideCount : DEFAULT_SLIDES
  const slideCount    = Math.max(MIN_SLIDES, Math.min(MAX_SLIDES, Math.floor(slideCountRaw)))

  const rawInstructions = Array.isArray(raw.slideInstructions) ? raw.slideInstructions : []
  const slideInstructions: string[] = rawInstructions
    .slice(0, MAX_SLIDES)
    .map(s => sanitizeText(s, 300))

  const customBrandRaw = sanitizeText(raw.customBrandPrompt, BRAND_PROMPT_MAX_LEN)
  const brandCtx = customBrandRaw || ACCEDRA_BRAND_CONTEXT

  const sanitizedBrief = sanitizeBrief(brief)
  const briefContext = sanitizedBrief ? `\n- Concepto base del usuario: "${sanitizedBrief}"` : ""

  // Build format-specific media section
  let mediaSection: string
  if (isReel) {
    mediaSection = `
###GUION###
Guión de contenido para grabar a cámara (talking-head, formato profesional pero cercano). Alguien del equipo de Accedra se graba explicando algo de forma clara.

SITUACIÓN: [Dónde grabar — ej: "en la oficina", "frente a una pizarra o pantalla", "en la sala de reuniones", "en el datacenter"]
HOOK (primeros 3 seg): [Primera frase dicha mirando directo a cámara. Tiene que parar el scroll — directa, sin intro larga.]
DESARROLLO:
- [Punto 1 — lo que decís, en lenguaje claro y profesional pero humano, sin tecnicismos innecesarios]
- [Punto 2]
- [Punto 3 — máximo 3-4 puntos para que fluya natural]
CIERRE: [Última frase o pregunta — CTA suave o algo que invite a comentar/contactar]

Duración: 20-40 segundos. Voz y cámara, buena luz. Hablar en primera persona, tono cercano y confiable. Ideal para LinkedIn/Instagram.`
  } else if (isCarrusel) {
    const slideParts = Array.from({ length: slideCount }, (_, i) => {
      const instr = slideInstructions[i]?.trim()
      const customNote = instr ? ` Instrucción del usuario para esta slide: "${instr}".` : ""
      return `###SLIDE_${i + 1}###
[Prompt en INGLÉS para DALL-E o Midjourney. Slide ${i + 1} de ${slideCount} del carrusel: concepto visual específico de esta slide dentro del flujo narrativo del carrusel.${customNote} Siempre incluir: ${VISUAL_BASE}.]`
    }).join("\n\n")
    mediaSection = "\n\n" + slideParts
  } else {
    mediaSection = `
###PROMPT_IMAGEN###
[Prompt en INGLÉS para DALL-E o Midjourney. Incluí: ${VISUAL_BASE}, y el concepto visual específico del post. Photorealistic corporate/tech elements if relevant.]`
  }

  try {
    const stream = await anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: isCarrusel ? 300 * slideCount + 1200 : 2000,
      messages: [{
        role: "user",
        content: `${brandCtx}

Generá el contenido completo para este post de ${PLATFORM_LABELS[platform as string] ?? platform}:
- Idea: "${title}"
- Ángulo: "${angle}"
- Hook: "${hook}"
- Audiencia: ${AUDIENCE_LABELS[audience as string] ?? audience}
- Objetivo: ${OBJECTIVE_LABELS[objective as string] ?? objective}
- Formato: ${format}${briefContext}

Usá EXACTAMENTE estos separadores (sin texto antes ni después de cada sección):

###CAPTION###
[Caption completo listo para publicar. Máx 150 palabras. Saltos de línea para que sea escaneable. Emojis donde sumen (con moderación, es B2B). Tono: profesional pero ameno y humano, español argentino. Empezá con el hook "${hook}".]

###CAPTION_CORTO###
[Versión ultra corta para Story o Reel. Máx 3 líneas impactantes.]

###HASHTAGS###
[8 hashtags con # incluido, separados por espacio. Mezcla: tecnología/IT + nicho del post (ciberseguridad, firma digital, redes, etc.) + Accedra.]

###CTA###
[Una sola línea de call to action que incluya accedra.com.ar. Directo y sin presión.]
${mediaSection}`,
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
    console.error("[contenido/copy]", err)
    return new NextResponse("Error", { status: 500 })
  }
}
