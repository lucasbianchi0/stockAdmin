import Anthropic from "@anthropic-ai/sdk"
import { NextResponse } from "next/server"
import {
  ACCEDRA_BRAND_CONTEXT,
  PLATFORM_LABELS,
  AUDIENCE_LABELS,
  FORMAT_TO_IDEA_FORMAT,
  VALID_IDEA_FORMATS_BY_PLATFORM,
  VALID_PLATFORMS,
  VALID_AUDIENCES,
  VALID_PLAN_FORMATS,
  BRAND_PROMPT_MAX_LEN,
  sanitizeBrief,
  sanitizeText,
} from "@/lib/contenido-context"

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const VALID_POST_COUNTS = new Set([3, 5, 7])
const VALID_OPTIONS_PER_POST = new Set([3, 4])

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
  const { mode, platform, audience, optionsPerPost, brief } = raw

  if (mode !== "full" && mode !== "slot") {
    return NextResponse.json({ error: "Modo inválido" }, { status: 400 })
  }
  if (!VALID_PLATFORMS.has(platform as string)) {
    return NextResponse.json({ error: "Plataforma inválida" }, { status: 400 })
  }
  if (!VALID_AUDIENCES.has(audience as string)) {
    return NextResponse.json({ error: "Audiencia inválida" }, { status: 400 })
  }
  if (!VALID_OPTIONS_PER_POST.has(optionsPerPost as number)) {
    return NextResponse.json({ error: "Opciones por post inválidas" }, { status: 400 })
  }

  const sanitizedBrief = sanitizeBrief(brief)
  const validFormats = VALID_IDEA_FORMATS_BY_PLATFORM[platform as string] ?? ["imagen", "carrusel", "reel", "story"]
  const formatsStr = validFormats.join(", ")
  const platformLabel = PLATFORM_LABELS[platform as string] ?? platform
  const audienceLabel = AUDIENCE_LABELS[audience as string] ?? audience

  const rawPlanFormat = typeof raw.formatPreference === "string" ? raw.formatPreference : "mixto"
  const planFormat    = VALID_PLAN_FORMATS.has(rawPlanFormat) ? rawPlanFormat : "mixto"
  const forcedIdeaFormat = planFormat !== "mixto" ? (FORMAT_TO_IDEA_FORMAT[planFormat] ?? null) : null
  const formatInstruction = forcedIdeaFormat && validFormats.includes(forcedIdeaFormat)
    ? `- Todas las publicaciones deben ser en formato "${forcedIdeaFormat}". El campo "format" SIEMPRE debe ser "${forcedIdeaFormat}".`
    : `- Variá los formatos entre las publicaciones. El campo "format" debe ser uno de: ${formatsStr}`

  const customBrandRaw = sanitizeText(raw.customBrandPrompt, BRAND_PROMPT_MAX_LEN)
  const brandCtx = customBrandRaw || ACCEDRA_BRAND_CONTEXT

  // ── Full plan generation ──────────────────────────────────────────────────

  if (mode === "full") {
    const { postCount } = raw
    if (!VALID_POST_COUNTS.has(postCount as number)) {
      return NextResponse.json({ error: "Cantidad de posts inválida" }, { status: 400 })
    }

    const rawPostBriefs = Array.isArray(raw.postBriefs) ? raw.postBriefs : []
    const postBriefs: string[] = rawPostBriefs
      .slice(0, postCount as number)
      .map(b => sanitizeText(b, 200))

    const hasPostBriefs = postBriefs.some(b => b.length > 0)
    const postBriefsSection = hasPostBriefs
      ? `\nContexto específico por post (respetá estas indicaciones al generar las opciones de cada slot):\n${postBriefs.map((b, i) => `- Post ${i + 1}: ${b || "sin preferencia específica"}`).join("\n")}`
      : ""

    try {
      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 4000,
        messages: [{
          role: "user",
          content: `${brandCtx}
Sos el content strategist de Accedra. Creá un plan de contenido para ${platformLabel}.

- Audiencia: ${audienceLabel}
- Publicaciones: ${postCount}
- Opciones por publicación: ${optionsPerPost}
${sanitizedBrief ? `- Brief del usuario: "${sanitizedBrief}"` : "- Brief: plan de contenido general para Accedra"}
${postBriefsSection}

El plan debe tener un arco narrativo coherente, no posts sueltos. Cada publicación tiene:
- "timing": cuándo publicar en relación al período (ej: "3 días antes", "Día 1", "Semana 2 — Lunes")
- "narrativeBeat": qué rol cumple en el arco (ej: "Teaser — generar anticipación", "Reveal — mostrar la solución", "Educación — cómo funciona", "Prueba social", "CTA — conversión")
- ${optionsPerPost} opciones creativas distintas entre sí para el mismo beat

Devolvé SOLO un JSON válido, sin markdown ni texto extra:
{
  "plan": {
    "title": "Nombre del plan (máx 6 palabras)",
    "arc": "Descripción del arco narrativo en 1 frase: qué historia cuenta la secuencia de posts",
    "posts": [
      {
        "slot": 1,
        "timing": "Cuándo publicar",
        "narrativeBeat": "Rol narrativo de este post",
        "options": [
          {
            "id": "1a",
            "title": "Título del post (máx 8 palabras)",
            "hook": "Primera línea que engancha al lector (máx 15 palabras)",
            "format": "imagen",
            "angle": "El ángulo creativo único en 1 frase corta"
          }
        ]
      }
    ]
  }
}

Reglas:
- Cada post tiene exactamente ${optionsPerPost} opciones con ángulos MUY distintos entre sí
${formatInstruction}
- La narrativa progresa lógicamente de un post al siguiente`,
        }],
      })

      const text = message.content[0].type === "text" ? message.content[0].text : ""
      const match = text.match(/\{[\s\S]*\}/)
      if (!match) throw new Error("No JSON found")
      const parsed = JSON.parse(match[0])
      if (!parsed?.plan?.posts) throw new Error("Invalid plan shape")
      return Response.json({ plan: parsed.plan })
    } catch (err) {
      console.error("[contenido/plan full]", err)
      return Response.json({ error: "Error al generar el plan" }, { status: 500 })
    }
  }

  // ── Single slot regeneration ──────────────────────────────────────────────

  if (!raw.slot || typeof raw.slot !== "object" || Array.isArray(raw.slot)) {
    return NextResponse.json({ error: "Datos del slot inválidos" }, { status: 400 })
  }

  const slotData = raw.slot as Record<string, unknown>
  const slotIndex = typeof slotData.index === "number" && Number.isInteger(slotData.index) && slotData.index >= 1
    ? slotData.index
    : null

  if (!slotIndex) {
    return NextResponse.json({ error: "Índice de slot inválido" }, { status: 400 })
  }

  const timing       = sanitizeBrief(slotData.timing).slice(0, 100)
  const narrativeBeat = sanitizeBrief(slotData.narrativeBeat).slice(0, 200)
  const planArc      = sanitizeBrief(slotData.planArc).slice(0, 500)

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 900,
      messages: [{
        role: "user",
        content: `${brandCtx}
Necesito ${optionsPerPost} opciones nuevas para el post ${slotIndex} de un plan para ${platformLabel}.

- Audiencia: ${audienceLabel}
- Arco del plan: "${planArc}"
- Este post: "${narrativeBeat}" — ${timing}
${sanitizedBrief ? `- Brief: "${sanitizedBrief}"` : ""}

Devolvé SOLO un JSON válido, sin markdown ni texto extra:
{
  "options": [
    {
      "id": "${slotIndex}a",
      "title": "Título del post (máx 8 palabras)",
      "hook": "Primera línea que engancha (máx 15 palabras)",
      "format": "imagen",
      "angle": "Ángulo creativo único en 1 frase corta"
    }
  ]
}

- Exactamente ${optionsPerPost} opciones con ángulos MUY distintos entre sí
${formatInstruction}`,
      }],
    })

    const text = message.content[0].type === "text" ? message.content[0].text : ""
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) throw new Error("No JSON found")
    const parsed = JSON.parse(match[0])
    if (!Array.isArray(parsed?.options)) throw new Error("Invalid options shape")
    return Response.json({ options: parsed.options })
  } catch (err) {
    console.error("[contenido/plan slot]", err)
    return Response.json({ error: "Error al regenerar opciones" }, { status: 500 })
  }
}
