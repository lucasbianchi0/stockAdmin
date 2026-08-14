import Anthropic from "@anthropic-ai/sdk"
import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import {
  ACCEDRA_BRAND_CONTEXT,
  AUDIENCIA_LABEL,
  CANAL_BRIEF,
  CANAL_LABEL,
  FORMATO_UNICO,
  OBJETIVOS,
  OBJETIVO_DESC,
  OBJETIVO_LABEL,
  esAudiencia,
  esCanal,
  esObjetivo,
  fechaLarga,
  type Audiencia,
  type Objetivo,
  type Opcion,
} from "@/lib/calendario-context"
import { aSlotsCliente } from "@/lib/calendario-server"

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export const maxDuration = 60

/**
 * Regenera la única idea de un slot.
 *
 * En el modelo de una sola idea, cuando la propuesta no convence no se elige otra
 * de una lista: se regenera. El usuario puede fijar título, ángulo, objetivo y
 * audiencia —lo que toca manda sobre lo que propone el modelo— y sumar una
 * instrucción libre. Sale una idea nueva y coherente, y como cambió, el contenido
 * y la imagen anteriores dejan de corresponder: se limpian.
 */
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
  const slotId = typeof raw.slotId === "string" ? raw.slotId : null
  if (!slotId) return NextResponse.json({ error: "Falta el slot" }, { status: 400 })

  const tituloHint = typeof raw.titulo === "string" ? raw.titulo.trim().slice(0, 200) : ""
  const anguloHint = typeof raw.angulo === "string" ? raw.angulo.trim().slice(0, 400) : ""
  const instruccion = typeof raw.instruccion === "string" ? raw.instruccion.trim().slice(0, 400) : ""
  const objetivoFijo: Objetivo | null = esObjetivo(raw.objetivo) ? raw.objetivo : null
  const audienciaFija: Audiencia | null =
    esAudiencia(raw.audiencia) && raw.audiencia !== "todos" ? raw.audiencia : null

  const { data: slot } = await supabase
    .from("content_slots")
    .select("*, content_plans (arco, contexto, audiencia)")
    .eq("id", slotId)
    .maybeSingle()

  if (!slot) return NextResponse.json({ error: "Slot inexistente" }, { status: 404 })
  if (!esCanal(slot.canal)) {
    return NextResponse.json({ error: "Canal inválido en el slot" }, { status: 500 })
  }

  const opciones = (slot.opciones ?? []) as Opcion[]
  const actual = opciones.find((o) => o.id === slot.elegida) ?? opciones[0] ?? null
  const plan = (slot.content_plans ?? {}) as Record<string, unknown>

  // Qué objetivo/audiencia usar: lo que fijó el usuario, si no lo de la idea
  // actual, si no un default razonable.
  const objetivo: Objetivo =
    objetivoFijo ?? (actual && esObjetivo(actual.objetivo) ? actual.objetivo : "awareness")
  const audiencia: Audiencia =
    audienciaFija ??
    (actual && esAudiencia(actual.audiencia) && actual.audiencia !== "todos"
      ? actual.audiencia
      : esAudiencia(plan.audiencia) && plan.audiencia !== "todos"
        ? (plan.audiencia as Audiencia)
        : "decisores")

  try {
    const idea = await regenerarIdea({
      canal: slot.canal,
      fecha: String(slot.fecha),
      beat: typeof slot.beat === "string" ? slot.beat : "",
      arco: typeof plan.arco === "string" ? plan.arco : "",
      contextoPlan: typeof plan.contexto === "string" ? plan.contexto : "",
      objetivo,
      audiencia,
      tituloHint,
      anguloHint,
      instruccion,
      anterior: actual,
    })

    const nueva: Opcion = {
      id: "a",
      titulo: idea.titulo || tituloHint || (actual?.titulo ?? "Idea"),
      hook: idea.hook,
      objetivo,
      audiencia,
      angulo: idea.angulo || anguloHint,
      imagen: idea.imagen,
      formato: FORMATO_UNICO,
      recomendada: true,
      porQue: idea.porQue,
    }

    const { data, error } = await supabase
      .from("content_slots")
      .update({
        opciones: [nueva],
        elegida: "a",
        // La idea cambió: el caption y la imagen anteriores ya no corresponden.
        contenido: null,
        imagen_path: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", slotId)
      .select()
      .single()

    if (error) throw error
    const [slotCliente] = await aSlotsCliente([data])
    return NextResponse.json({ slot: slotCliente })
  } catch (err) {
    console.error("[calendario/slot/regenerar]", err)
    return NextResponse.json({ error: "No se pudo regenerar la idea" }, { status: 500 })
  }
}

/* ── Generación ───────────────────────────────────────────────────────────── */

type IdeaCruda = {
  titulo: string
  hook: string
  angulo: string
  imagen: string
  porQue: string
}

async function regenerarIdea({
  canal,
  fecha,
  beat,
  arco,
  contextoPlan,
  objetivo,
  audiencia,
  tituloHint,
  anguloHint,
  instruccion,
  anterior,
}: {
  canal: "linkedin" | "meta"
  fecha: string
  beat: string
  arco: string
  contextoPlan: string
  objetivo: Objetivo
  audiencia: Audiencia
  tituloHint: string
  anguloHint: string
  instruccion: string
  anterior: Opcion | null
}): Promise<IdeaCruda> {
  const objetivosRef = OBJETIVOS.map(
    (o) => `  - ${OBJETIVO_LABEL[o]}: ${OBJETIVO_DESC[o]}`
  ).join("\n")

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1000,
    messages: [
      {
        role: "user",
        content: `${ACCEDRA_BRAND_CONTEXT}

Sos el content strategist de Accedra. Regenerá UNA idea de publicación para este espacio del calendario. No des variantes: proponé la mejor, coherente con lo que se te pide.

CANAL: ${CANAL_LABEL[canal]}
${CANAL_BRIEF[canal]}

DEFINICIÓN DE LA PIEZA (no se negocia):
- Objetivo de marketing: ${OBJETIVO_LABEL[objetivo]} — ${OBJETIVO_DESC[objetivo]}
- Audiencia: ${AUDIENCIA_LABEL[audiencia]}
- Se publica el ${fechaLarga(fecha)}${beat ? `\n- Rol en el arco: ${beat}` : ""}
${arco ? `- Arco del plan: "${arco}"` : ""}
${contextoPlan ? `- Contexto del plan: "${contextoPlan}"` : ""}

Contexto de objetivos disponibles (para calibrar el tono):
${objetivosRef}
${anterior ? `\nLA IDEA ACTUAL (la que el usuario quiere cambiar):\n- Título: "${anterior.titulo}"\n- Ángulo: "${anterior.angulo}"` : ""}
${tituloHint ? `\nEL USUARIO FIJÓ UN TÍTULO BASE: "${tituloHint}". Respetalo como punto de partida; podés mejorar la redacción, no el sentido.` : ""}
${anguloHint ? `\nEL USUARIO FIJÓ UN ÁNGULO BASE: "${anguloHint}". La idea nueva tiene que desarrollar ESE ángulo.` : ""}
${instruccion ? `\nINSTRUCCIÓN DEL USUARIO — tiene prioridad sobre todo lo demás: "${instruccion}"` : ""}

Devolvé SOLO este JSON, sin markdown ni texto alrededor:
{
  "titulo": "Título de la publicación, máx 8 palabras",
  "hook": "Primera línea que frena el scroll, máx 15 palabras",
  "angulo": "De qué trata: qué se cuenta, con qué estructura y para qué sirve. 2 frases concretas",
  "imagen": "Qué se va a VER en la pieza: encuadre, sujeto, si es foto o placa. 2 frases",
  "porQue": "Por qué esta idea cumple el objetivo y le habla a esa audiencia. 1 frase"
}`,
      },
    ],
  })

  const text = message.content[0]?.type === "text" ? message.content[0].text : ""
  const desde = text.indexOf("{")
  const hasta = text.lastIndexOf("}")
  if (desde === -1 || hasta <= desde) throw new Error("Sin JSON en la respuesta")

  const parsed = JSON.parse(text.slice(desde, hasta + 1)) as Record<string, unknown>
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "")

  return {
    titulo: str(parsed.titulo, 200),
    hook: str(parsed.hook, 300),
    angulo: str(parsed.angulo, 400),
    imagen: str(parsed.imagen, 400),
    porQue: str(parsed.porQue, 300),
  }
}
