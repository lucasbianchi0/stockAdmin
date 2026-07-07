import Anthropic from "@anthropic-ai/sdk"
import { NextResponse } from "next/server"
import {
  ACCEDRA_BRAND_CONTEXT,
  PLATFORM_LABELS,
  AUDIENCE_LABELS,
  OBJECTIVE_LABELS,
  FORMAT_PROMPT_LABELS,
  FORMAT_TO_IDEA_FORMAT,
  VALID_IDEA_FORMATS_BY_PLATFORM,
  VALID_PLATFORMS,
  VALID_AUDIENCES,
  VALID_OBJECTIVES,
  VALID_FORMAT_PREFERENCES,
  BRAND_PROMPT_MAX_LEN,
  sanitizeBrief,
  sanitizeText,
} from "@/lib/contenido-context"

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

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
  const { platform, audience, objective, formatPreference, brief } = raw

  if (!VALID_PLATFORMS.has(platform as string)) {
    return NextResponse.json({ error: "Plataforma inválida" }, { status: 400 })
  }
  if (!VALID_AUDIENCES.has(audience as string)) {
    return NextResponse.json({ error: "Audiencia inválida" }, { status: 400 })
  }
  if (!VALID_OBJECTIVES.has(objective as string)) {
    return NextResponse.json({ error: "Objetivo inválido" }, { status: 400 })
  }

  const fmtPref = typeof formatPreference === "string" ? formatPreference : "sin-preferencia"
  if (!VALID_FORMAT_PREFERENCES.has(fmtPref)) {
    return NextResponse.json({ error: "Formato inválido" }, { status: 400 })
  }

  const customBrandRaw = sanitizeText(raw.customBrandPrompt, BRAND_PROMPT_MAX_LEN)
  const brandCtx = customBrandRaw || ACCEDRA_BRAND_CONTEXT

  const sanitizedBrief = sanitizeBrief(brief)
  const hasFormat = fmtPref !== "sin-preferencia"
  const validIdeaFormats = VALID_IDEA_FORMATS_BY_PLATFORM[platform as string] ?? ["imagen", "carrusel", "reel", "story"]

  const ideaFormat = hasFormat ? (FORMAT_TO_IDEA_FORMAT[fmtPref] ?? validIdeaFormats[0]) : null
  const formatLabel = hasFormat ? (FORMAT_PROMPT_LABELS[fmtPref] ?? fmtPref) : null

  const formatInstruction = hasFormat
    ? `Todas las 6 ideas deben ser en formato ${formatLabel}. El campo "format" en el JSON SIEMPRE debe ser "${ideaFormat}".`
    : `Variá los formatos entre las 6 ideas. Los valores válidos para "format" son: ${validIdeaFormats.join(", ")}.`

  const briefInstruction = sanitizedBrief
    ? `\nConcepto del usuario (úsalo como punto de partida, generá 6 variaciones creativas distintas basadas en él): "${sanitizedBrief}"`
    : ""

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      messages: [{
        role: "user",
        content: `${brandCtx}
Generá exactamente 6 ideas de contenido para ${PLATFORM_LABELS[platform as string] ?? platform}.
- Audiencia: ${AUDIENCE_LABELS[audience as string] ?? audience}
- Objetivo: ${OBJECTIVE_LABELS[objective as string] ?? objective}
${briefInstruction}

${formatInstruction}

Devolvé SOLO un JSON válido, sin markdown ni texto extra:
{
  "ideas": [
    {
      "id": "1",
      "title": "Título del post (máx 8 palabras)",
      "hook": "Primera línea que engancha al lector (máx 15 palabras)",
      "format": "${ideaFormat ?? validIdeaFormats[0]}",
      "angle": "El ángulo creativo único de este post en 1 frase corta"
    }
  ]
}

Que cada idea tenga un ángulo distinto.`,
      }],
    })

    const text = message.content[0].type === "text" ? message.content[0].text : ""
    return Response.json({ text })
  } catch (err) {
    console.error("[contenido/ideas]", err)
    return Response.json({ error: "Error al generar ideas" }, { status: 500 })
  }
}
