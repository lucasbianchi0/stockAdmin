import Anthropic from "@anthropic-ai/sdk"
import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import {
  ACCEDRA_BRAND_CONTEXT,
  AUDIENCIA_LABEL,
  CANAL_BRIEF,
  CANAL_LABEL,
  OBJETIVO_DESC,
  OBJETIVO_LABEL,
  esAudiencia,
  esCanal,
  esObjetivo,
  fechaLarga,
  type Canal,
  type Contenido,
  type Opcion,
} from "@/lib/calendario-context"
import { IMAGE_PROMPT_BASE } from "@/lib/contenido-context"
import { aSlotsCliente } from "@/lib/calendario-server"

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/** Tope del plan hobby de Vercel; con Pro esto puede volver a 90. */
export const maxDuration = 60

/* ── PATCH · elegir una opción ────────────────────────────────────────────── */

/**
 * Marca qué opción del slot es la elegida. En el modelo de una sola idea los
 * planes nacen ya elegidos, pero se conserva para los planes viejos de tres
 * opciones y por si en algún flujo hay que limpiar la elección (`elegida: null`).
 * Cambiar de opción invalida el contenido: el caption era de la otra idea.
 */
export async function PATCH(req: Request) {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const raw = await leerBody(req)
  if (!raw) return NextResponse.json({ error: "Body inválido" }, { status: 400 })

  const slotId = typeof raw.slotId === "string" ? raw.slotId : null
  if (!slotId) return NextResponse.json({ error: "Falta el slot" }, { status: 400 })

  if (!("elegida" in raw)) {
    return NextResponse.json({ error: "Mandá 'elegida'" }, { status: 400 })
  }

  const { data: slot } = await supabase
    .from("content_slots")
    .select("opciones")
    .eq("id", slotId)
    .maybeSingle()

  if (!slot) return NextResponse.json({ error: "Slot inexistente" }, { status: 404 })

  const elegida =
    raw.elegida === null ? null : typeof raw.elegida === "string" ? raw.elegida : undefined
  if (elegida === undefined) {
    return NextResponse.json({ error: "Opción inválida" }, { status: 400 })
  }

  const opciones = (slot.opciones ?? []) as Opcion[]
  if (elegida !== null && !opciones.some((o) => o.id === elegida)) {
    return NextResponse.json({ error: "Esa opción no existe en el slot" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("content_slots")
    .update({ elegida, contenido: null, updated_at: new Date().toISOString() })
    .eq("id", slotId)
    .select()
    .single()

  if (error) {
    console.error("[calendario/slot PATCH]", error)
    return NextResponse.json({ error: "No se pudo guardar el cambio" }, { status: 500 })
  }

  return NextResponse.json({ slot: await unSlot(data) })
}

/* ── POST · generar el contenido completo del slot ────────────────────────── */

export async function POST(req: Request) {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const raw = await leerBody(req)
  if (!raw) return NextResponse.json({ error: "Body inválido" }, { status: 400 })

  const slotId = typeof raw.slotId === "string" ? raw.slotId : null
  if (!slotId) return NextResponse.json({ error: "Falta el slot" }, { status: 400 })

  const ajuste = typeof raw.ajuste === "string" ? raw.ajuste.trim().slice(0, 400) : ""

  const { data: slot } = await supabase
    .from("content_slots")
    .select("*, content_plans (arco, audiencia, contexto)")
    .eq("id", slotId)
    .maybeSingle()

  if (!slot) return NextResponse.json({ error: "Slot inexistente" }, { status: 404 })
  if (!slot.elegida) {
    return NextResponse.json({ error: "Primero elegí una de las opciones" }, { status: 400 })
  }
  if (!esCanal(slot.canal)) {
    return NextResponse.json({ error: "Canal inválido en el slot" }, { status: 500 })
  }

  const opcion = ((slot.opciones ?? []) as Opcion[]).find((o) => o.id === slot.elegida)
  if (!opcion) {
    return NextResponse.json({ error: "La opción elegida ya no existe" }, { status: 400 })
  }

  const plan = (slot.content_plans ?? {}) as Record<string, unknown>
  // Audiencia y objetivo salen de la pieza, no del plan: dentro de un mismo plan
  // una pieza de conversión le habla a decisores y una de cultura a corporativo.
  // Los planes viejos, sin estos campos en la opción, caen al perfil del plan.
  const audiencia = esAudiencia(opcion.audiencia)
    ? opcion.audiencia
    : esAudiencia(plan.audiencia)
      ? plan.audiencia
      : "todos"
  const objetivo = esObjetivo(opcion.objetivo) ? opcion.objetivo : "awareness"

  try {
    const contenido = await generarContenido({
      canal: slot.canal,
      opcion,
      beat: typeof slot.beat === "string" ? slot.beat : "",
      fecha: String(slot.fecha),
      arco: typeof plan.arco === "string" ? plan.arco : "",
      contextoPlan: typeof plan.contexto === "string" ? plan.contexto : "",
      audienciaLabel: AUDIENCIA_LABEL[audiencia],
      objetivoLabel: OBJETIVO_LABEL[objetivo],
      objetivoDesc: OBJETIVO_DESC[objetivo],
      ajuste,
    })

    const { data, error } = await supabase
      .from("content_slots")
      .update({ contenido, updated_at: new Date().toISOString() })
      .eq("id", slotId)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ slot: await unSlot(data) })
  } catch (err) {
    console.error("[calendario/slot POST]", err)
    return NextResponse.json({ error: "No se pudo generar el contenido" }, { status: 500 })
  }
}

/* ── Generación ───────────────────────────────────────────────────────────── */

/** Base visual compartida con el Content Studio, en inglés para los generadores. */
// Sale del Brand Kit: los hex escritos a mano acá se quedaron con el azul viejo.
const BASE_VISUAL = IMAGE_PROMPT_BASE

const MEDIDA: Record<Canal, string> = {
  linkedin: "1200x627px (horizontal) o 1080x1080px (cuadrado)",
  meta: "1080x1080px (cuadrado, sirve para feed de Instagram y Facebook)",
}

async function generarContenido({
  canal,
  opcion,
  beat,
  fecha,
  arco,
  contextoPlan,
  audienciaLabel,
  objetivoLabel,
  objetivoDesc,
  ajuste,
}: {
  canal: Canal
  opcion: Opcion
  beat: string
  fecha: string
  arco: string
  contextoPlan: string
  audienciaLabel: string
  objetivoLabel: string
  objetivoDesc: string
  ajuste: string
}): Promise<Contenido> {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: [
          /*
           * El brand kit, en su propio bloque y cacheado.
           *
           * Es la llamada que más se repite del sistema: una por pieza, ocho por
           * lote, y cada una mandaba estos 4.448 tokens de nuevo. El bloque va
           * primero y sin interpolar nada adentro porque el caché es un prefijo:
           * un byte distinto adelante y no cachea ninguna.
           */
          {
            type: "text" as const,
            text: ACCEDRA_BRAND_CONTEXT,
            cache_control: { type: "ephemeral" as const },
          },
          {
            type: "text" as const,
            text: `Generá el contenido completo y listo para publicar de esta pieza.

CANAL: ${CANAL_LABEL[canal]}
${CANAL_BRIEF[canal]}

LA PIEZA:
- Título interno: "${opcion.titulo}"${
                    opcion.tesis ? `\n- TESIS que defiende — es lo que el caption tiene que desarrollar: "${opcion.tesis}"` : ""
                  }${
                    opcion.headline
                      ? `\n- TITULAR YA IMPRESO EN LA IMAGEN: "${opcion.headline}"\n  Este texto ya está decidido y va a estar VISIBLE en la pieza. El caption lo desarrolla y lo sostiene: no lo repite palabra por palabra en la primera línea —queda redundante al lado de la imagen— pero tampoco lo contradice ni cambia de tema.`
                      : ""
                  }
- Hook: "${opcion.hook}"
- Ángulo: "${opcion.angulo}"${opcion.imagen ? `\n- Pieza visual comprometida: "${opcion.imagen}"` : ""}
- Formato: ${opcion.formato}
- Se publica el ${fechaLarga(fecha)}${beat ? `\n- Rol en el plan: ${beat}` : ""}
- Audiencia a la que le habla: ${audienciaLabel}
- Objetivo de marketing: ${objetivoLabel} — ${objetivoDesc}. Escribí el caption para cumplir ESE objetivo: si es Conversión, cerrá con un llamado a la acción claro; si es Educación, enseñá algo concreto y verificable; si es Awareness, priorizá la historia y la marca por encima de la venta.
${arco ? `- Arco del calendario del que forma parte: "${arco}"` : ""}
${contextoPlan ? `- Contexto que dio el usuario para todo el plan: "${contextoPlan}"` : ""}
${ajuste ? `\nAJUSTE PEDIDO POR EL USUARIO — tiene prioridad: "${ajuste}"` : ""}

Usá EXACTAMENTE estos separadores, sin texto antes ni después de cada sección:

###CAPTION###
[Antes de escribir, resolvé estas cuatro cosas contra el contexto de marca de arriba. No las escribas en la respuesta: usalas.

1. QUIÉN LEE. Elegí UNA de las buyer personas del kit, la que corresponde a la audiencia de esta pieza. Una sola: un texto que le habla a dos no le habla a ninguna.
2. QUÉ LE DUELE. Tomá uno de los ítems del "Duele" de esa persona y abrí con eso, en segunda persona y con voseo. No "la seguridad es un desafío para las empresas": "tu red quedó chica frente al crecimiento".
3. QUÉ LO PRUEBA. En el medio va UN dato concreto del catálogo: una tecnología con nombre y modelo (Catalyst 9200, SD-WAN, Umbrella), una cifra publicada o un caso con su cliente. Uno solo, y tiene que estar en el kit. Si no está, no va — inventar un número es peor que no dar ninguno.
4. CÓMO CIERRA. Con un ítem del "Convence" de esa misma persona.

Ahora escribí el texto completo, listo para copiar y pegar. Arrancá con el hook. Saltos de línea para que sea escaneable. Español argentino con voseo, sin jerga vacía ni humo motivacional. Sin emojis y sin signos de exclamación: lo dice el tono de la marca. ${
          canal === "linkedin"
            ? "150 a 250 palabras. Que tenga una idea técnica concreta y verificable, no generalidades."
            : "60 a 120 palabras. Escaneable. La primera línea tiene que frenar el scroll."
        }

Test antes de entregar: si el caption se puede copiar y pegar en la web de cualquier integrador de IT del país sin cambiarle una palabra, está mal. Reescribilo.]

###CAPTION_CORTO###
[Versión de 2 o 3 líneas para story o para reutilizar como copy de anuncio.]

###HASHTAGS###
[${canal === "linkedin" ? "5" : "8"} hashtags con # incluido, separados por espacio. Mezcla de tecnología/IT, el nicho puntual del post y la marca.]

###CTA###
[Una sola línea de call to action que incluya accedra.com.ar. Directo, sin presión comercial.]

###PROMPT_IMAGEN###
[Prompt en INGLÉS para DALL-E o Midjourney que describa el visual de esta pieza. Incluí siempre: ${BASE_VISUAL}, ${MEDIDA[canal]}.]`,
          },
        ],
      },
    ],
  })

  const text = message.content[0].type === "text" ? message.content[0].text : ""
  return parsearSecciones(text)
}

/**
 * Mismo esquema de separadores que usa el Content Studio. Se corta en el
 * siguiente `###` y no en el marcador siguiente esperado: si el modelo omite una
 * sección, cortar por nombre haría que una sección se coma a la que sigue.
 */
function parsearSecciones(text: string): Contenido {
  const leer = (marcador: string) => {
    const i = text.indexOf(marcador)
    if (i === -1) return ""
    const desde = i + marcador.length
    const siguiente = text.indexOf("###", desde)
    return text.slice(desde, siguiente === -1 ? undefined : siguiente).trim()
  }

  return {
    caption: leer("###CAPTION###"),
    captionCorto: leer("###CAPTION_CORTO###"),
    hashtags: leer("###HASHTAGS###"),
    cta: leer("###CTA###"),
    promptImagen: leer("###PROMPT_IMAGEN###"),
  }
}

/* ── Utilidades ───────────────────────────────────────────────────────────── */

async function leerBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json()
    if (!body || typeof body !== "object" || Array.isArray(body)) return null
    return body as Record<string, unknown>
  } catch {
    return null
  }
}

/** Un slot con la URL de su imagen firmada. El mapeo vive en calendario-server
 *  para que las cuatro rutas del calendario devuelvan exactamente la misma forma. */
async function unSlot(fila: Record<string, unknown>) {
  const [slot] = await aSlotsCliente([fila])
  return slot
}
