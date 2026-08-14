import Anthropic from "@anthropic-ai/sdk"
import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { fechaLarga, type Contenido, type Opcion } from "@/lib/calendario-context"
import {
  VARIABLES_VACIAS,
  VOCABULARIO_ACCEDRA,
  normalizarVariables,
  variablesUsables,
  type VariablesFeed,
} from "@/lib/feed-variables"
import { promptDeFeed, templateFeedPorId, type CampoFeed } from "@/lib/templates-feed"

/**
 * El prompt del camino 2, armado en el servidor.
 *
 * Se arma acá y no en el navegador por lo mismo que `prompt-pieza.ts` vive en su
 * propio módulo: lo piden la generación en lote y el botón de la pieza, y dos
 * formas de armarlo son dos piezas distintas saliendo del mismo botón. Pero acá
 * además hay una llamada a un modelo en el medio, así que el lugar es el
 * servidor y no una función compartida.
 *
 * Devuelve también las variables ya resueltas: sin verlas, cuando una pieza sale
 * con un número que no corresponde no hay forma de saber si lo eligió mal el
 * derivador o lo alucinó el generador de imágenes.
 */

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export const maxDuration = 60

/** Qué se le pide al modelo por cada campo que el template necesita. */
const INSTRUCCION: Record<CampoFeed, string> = {
  headline: `"headline": ["línea 1", "línea 2", "línea 3"] — el titular impreso en la pieza, cortado en 2 o 3 líneas de 2 a 4 palabras cada una, 9 palabras como máximo en total. Español argentino, sin punto final. Es una tesis o una afirmación, nunca un anuncio ni una pregunta retórica vacía.
"destacado": "1 a 3 palabras que aparezcan EXACTAMENTE en el headline, tal cual están escritas ahí, y que merezcan ir en azul"`,
  category: `"category": "el rubro, 1 o 2 palabras en mayúsculas (ej: NETWORKING, SEGURIDAD IT, CLOUD, CASO DE ÉXITO, INFORME)"`,
  servicios: `"servicios": ["...", "..."] — 3 o 4 etiquetas de 1 a 3 palabras, tomadas de los ítems del catálogo de la línea de servicio que corresponda a esta pieza`,
  features: `"features": ["...", "..."] — 2 o 3 capacidades concretas de 1 a 3 palabras, del catálogo`,
  metrica: `"metrica": "la cifra, tal cual figura publicada y en su forma más simple: un número con su símbolo y nada más (ej: 99,99%, +1.260, +400, 17). Nunca una notación que haya que interpretar — sin flechas, sin '→', sin '<' ni '>', sin rangos tipo '5 a 1'. Si la cifra publicada tiene esa forma, quedate con el número final solo."
"metricaLabel": "qué mide esa cifra, 2 a 4 palabras, en castellano llano"
Si ninguna cifra del catálogo aplica a esta pieza, devolvé las dos vacías. NO inventes un número.`,
  cta: `"cta": "un llamado a la acción de 3 a 5 palabras, sin signos de exclamación"`,
  evento: `"fecha": "la fecha del evento como se escribe en una placa (ej: 12 de septiembre)"
"lugar": "dónde es, hasta 5 palabras"
"codigo": "stand, sala o código, hasta 3 palabras"
Si la pieza no anuncia un evento con datos concretos, devolvé los tres vacíos.`,
  partner: `"partner": "el nombre del fabricante, del listado de partners"
"partnerNivel": "la certificación o el nivel, hasta 4 palabras"
Si la pieza no es sobre un partner concreto, devolvé los dos vacíos.`,
  clientes: `"clientes": ["...", "..."] — 4 a 6 nombres, únicamente del listado de clientes públicos`,
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
  const slotId = typeof raw.slotId === "string" ? raw.slotId : null
  if (!slotId) return NextResponse.json({ error: "Falta el slot" }, { status: 400 })

  const template = templateFeedPorId(typeof raw.templateFeedId === "string" ? raw.templateFeedId : null)
  if (!template) return NextResponse.json({ error: "Ese template no existe" }, { status: 400 })

  const { data: slot } = await supabase
    .from("content_slots")
    .select("*, content_plans (arco, contexto)")
    .eq("id", slotId)
    .maybeSingle()

  if (!slot) return NextResponse.json({ error: "Slot inexistente" }, { status: 404 })

  const opcion = ((slot.opciones ?? []) as Opcion[]).find((o) => o.id === slot.elegida)
  if (!opcion) {
    return NextResponse.json({ error: "Primero elegí una de las opciones" }, { status: 400 })
  }

  const contenido = (slot.contenido ?? null) as Contenido | null
  const plan = (slot.content_plans ?? {}) as Record<string, unknown>

  let variables: VariablesFeed
  try {
    variables = await derivarVariables({
      campos: template.pide,
      nombreTemplate: template.nombre,
      cuandoUsar: template.cuandoUsar,
      opcion,
      caption: contenido?.caption ?? "",
      fecha: String(slot.fecha),
      contextoPlan: typeof plan.contexto === "string" ? plan.contexto : "",
    })
  } catch (err) {
    console.error("[slot/prompt-feed derivar]", err)
    variables = VARIABLES_VACIAS
  }

  // Sin titular la pieza no se puede imprimir. Antes de fallar se usa el título
  // de la opción cortado a mano: es peor que lo que devuelve el modelo, pero
  // once piezas del lote no se pierden porque una llamada de texto falló.
  if (!variablesUsables(variables)) {
    variables = { ...variables, headline: cortarEnLineas(opcion.titulo) }
  }

  if (!variablesUsables(variables)) {
    return NextResponse.json({ error: "No se pudo armar el titular" }, { status: 500 })
  }

  return NextResponse.json({
    prompt: promptDeFeed(template, variables),
    variables,
    template: { id: template.id, nombre: template.nombre, familia: template.familia },
  })
}

/* ── Derivación ───────────────────────────────────────────────────────────── */

async function derivarVariables({
  campos,
  nombreTemplate,
  cuandoUsar,
  opcion,
  caption,
  fecha,
  contextoPlan,
}: {
  campos: CampoFeed[]
  nombreTemplate: string
  cuandoUsar: string
  opcion: Opcion
  caption: string
  fecha: string
  contextoPlan: string
}): Promise<VariablesFeed> {
  const pedido = campos.map((c) => INSTRUCCION[c]).join("\n")

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 800,
    messages: [
      {
        role: "user",
        content: `${VOCABULARIO_ACCEDRA}

Sos el director de arte de Accedra. La publicación ya está escrita; tu trabajo es traducirla a las variables de un template visual. No estás escribiendo contenido nuevo.

LA PUBLICACIÓN
- Título: "${opcion.titulo}"
- Hook: "${opcion.hook}"
- Ángulo: "${opcion.angulo}"${opcion.imagen ? `\n- Qué se ve: "${opcion.imagen}"` : ""}
- Se publica el ${fechaLarga(fecha)}${
          contextoPlan ? `\n- Contexto del plan: "${contextoPlan}"` : ""
        }${caption ? `\n- Caption ya escrito: """${caption.slice(0, 900)}"""` : ""}

EL TEMPLATE: ${nombreTemplate} — ${cuandoUsar}

Devolvé SOLO este JSON, sin markdown ni texto alrededor:
{
${pedido}
}

Reglas que no se negocian:
- Todo lo que sea un servicio, una tecnología, un cliente, un partner o una cifra sale del catálogo de arriba. Si no está ahí, va vacío.
- El texto se va a imprimir DENTRO de la imagen: cortito, sin comillas adentro, sin emojis, sin hashtags.
- Un campo que no aplique a esta pieza va vacío ("" o []). Vacío es una respuesta correcta; inventar no.`,
      },
    ],
  })

  const text = message.content[0]?.type === "text" ? message.content[0].text : ""
  const desde = text.indexOf("{")
  const hasta = text.lastIndexOf("}")
  if (desde === -1 || hasta <= desde) throw new Error("Sin JSON en la respuesta")

  return normalizarVariables(JSON.parse(text.slice(desde, hasta + 1)))
}

/**
 * El titular cortado a ojo, para el camino de emergencia.
 *
 * Reparte las palabras en tres líneas parejas. No es una decisión tipográfica,
 * es evitar que un título de nueve palabras entre como una sola línea que el
 * generador va a escribir en cuerpo 12.
 */
function cortarEnLineas(titulo: string): string[] {
  const palabras = titulo.trim().split(/\s+/).filter(Boolean).slice(0, 9)
  if (palabras.length === 0) return []

  const lineas = palabras.length <= 3 ? 1 : palabras.length <= 6 ? 2 : 3
  const porLinea = Math.ceil(palabras.length / lineas)

  return Array.from({ length: lineas }, (_, i) =>
    palabras.slice(i * porLinea, (i + 1) * porLinea).join(" ")
  ).filter(Boolean)
}
