import Anthropic from "@anthropic-ai/sdk"
import { crearClienteClaude, hayClaveClaude } from "@/lib/anthropic"
import { NextResponse } from "next/server"

import { ruta } from "@/lib/admin/ruta"
import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { PROMPTS, armarPrompt } from "@/lib/brand-kit"
import { CONTEXTOS_MARCA, EXTENSIONES_TEXTO, TIPOS_TEXTO, type TextoGenerado } from "@/lib/generador"
import { usuarioActual } from "@/lib/generador-server"

const anthropic = crearClienteClaude()

/**
 * Opus 5.5 y no Sonnet: es texto que sale publicado con la firma de la empresa,
 * y la diferencia de costo por pedido es de centavos. Con red de respaldo por
 * si un clasificador declina un pedido legítimo (pasa con temas de seguridad
 * informática, que es justamente de lo que habla Accedra).
 */
const MODELO = "claude-opus-5-5"

export const maxDuration = 60

/** El mensaje legible de un error de la API, sin el JSON alrededor. */
function mensajeDeError(err: unknown): string {
  if (err instanceof Anthropic.APIError) {
    const interno = (err.error as { error?: { message?: string } } | undefined)?.error?.message
    return `Anthropic ${err.status ?? ""}: ${interno ?? err.message}`.trim()
  }
  return err instanceof Error ? err.message : "No se pudo generar el texto"
}

const corto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "")

/* ── GET · recientes ──────────────────────────────────────────────────────── */

export const GET = ruta("generador texto GET", async () => {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const { data, error } = await supabase
    .from("generador_historial")
    .select("id, prompt, texto, parametros, created_at")
    .eq("tipo", "texto")
    .order("created_at", { ascending: false })
    .limit(30)

  if (error) {
    console.error("[generador texto GET]", error)
    return NextResponse.json({ error: "No se pudo cargar el historial" }, { status: 500 })
  }

  const textos: TextoGenerado[] = (data ?? []).map((f) => ({
    id: String(f.id),
    prompt: String(f.prompt),
    texto: String(f.texto ?? ""),
    tipoTexto: String((f.parametros as Record<string, unknown> | null)?.tipo ?? "libre"),
    createdAt: String(f.created_at),
  }))
  return NextResponse.json({ textos })
})

/* ── POST · generar (streaming) ───────────────────────────────────────────── */

export const POST = ruta("generador texto POST", async (req: Request) => {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  if (!hayClaveClaude()) {
    return NextResponse.json({ error: "Falta OPENROUTER_API_KEY o ANTHROPIC_API_KEY" }, { status: 500 })
  }

  let raw: Record<string, unknown>
  try {
    raw = (await req.json()) ?? {}
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }

  const prompt = corto(raw.prompt, 6000)
  if (!prompt) return NextResponse.json({ error: "Escribí qué contenido necesitás" }, { status: 400 })

  const tipo = TIPOS_TEXTO.find((t) => t.id === raw.tipo) ?? TIPOS_TEXTO[0]
  const extension = EXTENSIONES_TEXTO.find((e) => e.id === raw.extension)
  const canal = corto(raw.canal, 60)
  const publico = corto(raw.publico, 300)
  const objetivo = corto(raw.objetivo, 120)
  const tono = corto(raw.tono, 120)
  const idioma = corto(raw.idioma, 60) || "Español (Argentina)"
  const marca = raw.marca !== false
  // Qué recorte del Brand Kit acompaña al texto: un mail comercial necesita las
  // objeciones de cada persona; un post, el tono con pares mal/bien.
  const contexto = CONTEXTOS_MARCA.find((c) => c.id === raw.contexto)?.id ?? "contenido"
  const disciplina = PROMPTS.find((p) => p.id === contexto) ?? PROMPTS[0]

  // Iterar sobre un resultado: el texto anterior más el ajuste pedido.
  const anterior = corto(raw.anterior, 20000)
  const ajuste = corto(raw.ajuste, 2000)

  const parametros = [
    `- Tipo de contenido: ${tipo.nombre}. ${tipo.guia}`,
    canal && `- Canal: ${canal}`,
    publico && `- Público: ${publico}`,
    objetivo && `- Objetivo: ${objetivo}`,
    tono && `- Tono: ${tono}`,
    extension && `- Extensión: ${extension.guia}`,
    `- Idioma: ${idioma}`,
  ]
    .filter(Boolean)
    .join("\n")

  const system = [
    "Sos redactor/a senior del equipo de marketing. Escribís contenido listo para usar.",
    "Devolvé SOLO el contenido pedido: sin introducciones, sin explicar lo que hiciste, sin ofrecer alternativas que no se pidieron y sin cerrar con preguntas al usuario.",
    "Si el formato lo necesita, usá Markdown simple (## subtítulos, **negrita**, listas).",
    marca
      ? `Escribís para esta empresa. Respetá su tono, sus servicios reales y los claims prohibidos:\n\n${armarPrompt(disciplina)}`
      : "No asumas ninguna marca: escribí exactamente sobre lo que diga el pedido.",
  ].join("\n\n")

  const messages: Anthropic.Beta.BetaMessageParam[] =
    anterior && ajuste
      ? [
          { role: "user", content: `${prompt}\n\nParámetros:\n${parametros}` },
          { role: "assistant", content: anterior },
          {
            role: "user",
            content: `Reescribí el contenido anterior aplicando este ajuste: ${ajuste}\n\nMantené todo lo que el ajuste no menciona. Devolvé el contenido completo, no solo la parte cambiada.`,
          },
        ]
      : [{ role: "user", content: `${prompt}\n\nParámetros:\n${parametros}` }]

  // Antes de abrir el stream: las cookies de la sesión no se pueden leer una
  // vez que la respuesta empezó a salir.
  const autor = await usuarioActual()

  const stream = anthropic.beta.messages.stream({
    model: MODELO,
    max_tokens: 16000,
    output_config: { effort: "medium" },
    betas: ["server-side-fallback-2026-06-01"],
    fallbacks: [{ model: "claude-opus-4-8" }],
    system,
    messages,
  })

  // Se espera el primer evento ANTES de responder. Los errores de la API (sin
  // crédito, clave inválida, límite) llegan ahí, y así viajan como un error de
  // verdad y no como texto adentro del resultado.
  const eventos = stream[Symbol.asyncIterator]()
  let primero: IteratorResult<Anthropic.Beta.BetaRawMessageStreamEvent>
  try {
    primero = await eventos.next()
  } catch (err) {
    console.error("[generador texto]", err)
    return NextResponse.json({ error: mensajeDeError(err) }, { status: 502 })
  }

  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      let texto = ""
      try {
        for (let r = primero; !r.done; r = await eventos.next()) {
          const evento = r.value
          if (evento.type === "content_block_delta" && evento.delta.type === "text_delta") {
            texto += evento.delta.text
            controller.enqueue(encoder.encode(evento.delta.text))
          }
        }
        const final = await stream.finalMessage()
        if (final.stop_reason === "refusal") {
          controller.enqueue(encoder.encode("\n\n[El modelo no pudo generar este contenido. Probá reformular el pedido.]"))
        }
      } catch (err) {
        console.error("[generador texto]", err)
        controller.enqueue(encoder.encode(`\n\n[Se cortó la generación: ${mensajeDeError(err)}]`))
      }

      // Se anota al terminar, con el resultado completo. Un fallo acá no
      // corta nada: el texto ya le llegó a la persona.
      if (texto.trim()) {
        const { error } = await supabase.from("generador_historial").insert({
          tipo: "texto",
          prompt,
          parametros: {
            tipo: tipo.id,
            canal,
            publico,
            objetivo,
            tono,
            extension: extension?.id ?? null,
            idioma,
            marca,
            contexto: marca ? contexto : null,
            ajuste: ajuste || null,
          },
          texto,
          modelo: MODELO,
          created_by: autor,
        })
        if (error) console.error("[generador texto historial]", error)
      }
      controller.close()
    },
  })

  return new NextResponse(readable, { headers: { "Content-Type": "text/plain; charset=utf-8" } })
})
