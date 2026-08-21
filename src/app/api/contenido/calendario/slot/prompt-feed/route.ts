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
import {
  DESTACADO_GUIA,
  DOCTRINA_HEADLINE,
  HEADLINE_MAX_PALABRAS,
  TEST_RECHAZO,
  cortarHeadline,
  limpiarTitular,
  plano,
  tramoAzul,
} from "@/lib/copy-headline"

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

/**
 * El vocabulario de rótulos. Cerrado a propósito.
 *
 * "El rubro, 1 o 2 palabras en mayúsculas" devolvía uno distinto por pieza —
 * SEGURIDAD IT en una, CIBERSEGURIDAD en la siguiente— y en la grilla de
 * Instagram eso se lee como dos marcas. Una lista para elegir se cumple; una
 * descripción de la forma, no.
 *
 * Son los mismos que llevan los templates como `rubro`: el que elige el modelo y
 * el que pone el código cuando el modelo no contesta tienen que salir del mismo
 * vocabulario, o el fallback se nota.
 */
const RUBROS = [
  "INFRAESTRUCTURA",
  "CONECTIVIDAD",
  "SOPORTE TÉCNICO",
  "DATA CENTER",
  "CIBERSEGURIDAD",
  "CLOUD",
  "CLIENTES",
  "EN CAMPO",
  "COBERTURA",
  "INSIGHT",
  "CASO DE ÉXITO",
  "EVENTO",
  "PARTNERSHIP",
  "EQUIPO ACCEDRA",
  "INFORME",
] as const

/**
 * Qué se le pide al modelo por cada campo que el template necesita.
 *
 * `headline` es el caso especial y por eso no está acá: desde el 17/8 el titular
 * llega escrito desde el plan, así que lo que se pide no es redactarlo sino
 * cortarlo en líneas. Lo arma `instruccionHeadline`, que tiene los dos caminos.
 */
const INSTRUCCION: Record<Exclude<CampoFeed, "headline"> | "bajada", string> = {
  bajada: `"bajada": una o dos frases que DESARROLLAN el titular, hasta 170 caracteres. Se imprimen debajo, en cuerpo chico.
No repite el titular con otras palabras: agrega el porqué, la consecuencia o el dato que lo sostiene. Si el titular dice "Tu firewall no ve al que ya está adentro", la bajada explica por qué pasa eso, no lo vuelve a decir.
Español argentino con voseo, sin emojis, sin hashtags, sin comillas adentro. Frases cortas.`,
  category: `"category": el rótulo chico que va arriba del titular, en mayúsculas. OBLIGATORIO — vacío no es una respuesta válida acá.
Elegí el que describa esta pieza, de esta lista y sin inventar uno nuevo:
${RUBROS.join(" · ")}
Un rubro distinto por pieza no hace un feed variado: hace un feed que parece de varias marcas. Si dudás entre dos, elegí el de la línea de servicio del catálogo que la pieza vende.`,
  servicios: `"servicios": ["...", "..."] — 3 o 4 etiquetas de 1 a 3 palabras, tomadas de los ítems del catálogo de la línea de servicio que corresponda a esta pieza`,
  features: `"features": ["...", "..."] — 2 o 3 capacidades concretas de 1 a 3 palabras, del catálogo`,
  metrica: `"metrica": la cifra que se va a imprimir GIGANTE, ocupando media pieza. Solo dígitos, con un "+" adelante o un "%" atrás si corresponde: 99,99% · +1.260 · +400 · 17 · 24/7.
NINGÚN otro carácter, nunca: ni "<", ni ">", ni "→", ni "≤", ni "~", ni "menos de", ni rangos tipo "5 a 1" o "5→<1". Un símbolo dibujado a ese tamaño arruina la pieza, y por eso una cifra que no cumpla esta forma se descarta entera del lado del servidor: mandarla igual no la imprime, solo deja el bloque vacío.
Si la cifra del catálogo viene como un salto ("5→<1 caídas por mes"), NO la recortes para que entre: ese dato se cuenta en el titular con palabras, no acá. Devolvé la métrica vacía y elegí otra cifra del catálogo, o ninguna.
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

/**
 * Lo que se pide para el titular, según venga escrito o no.
 *
 * El camino de arriba es el normal: el titular ya se escribió en el plan, con
 * todo el contexto de marca y el arco de los quince días delante, y acá solo se
 * decide dónde parte la frase. Reescribirlo sería volver a comprimir, que es
 * justamente lo que producía "Nunca confiar. Siempre verificar. Mínimo
 * privilegio".
 *
 * El de abajo es para los planes anteriores al cambio, que no tienen `headline`
 * guardado. Ahí sí hay que redactar, y se redacta con la doctrina completa —no
 * resumiendo el caption, que es de donde venía el problema—.
 */
function instruccionHeadline(headline: string): string {
  if (headline) {
    return `"headline": el titular YA ESTÁ ESCRITO y es este:
"""
${headline}
"""
NO lo reescribas, no lo acortes, no lo mejores y no le cambies una palabra. Tu único trabajo con él es CORTARLO en 2 o 3 líneas para que entre en la placa, devolviéndolo como ["línea 1", "línea 2", ...]. La suma de las líneas tiene que dar el titular completo, letra por letra, incluyendo tildes y puntuación.
Cortá donde la frase respira: entre las dos oraciones si son dos, o antes del verbo. Nunca partas una palabra ni dejes una línea de una sola palabra corta.

${DESTACADO_GUIA}`
  }

  return `"headline": ["línea 1", "línea 2", "línea 3"] — el titular impreso en la pieza, cortado en 2 o 3 líneas, hasta ${HEADLINE_MAX_PALABRAS} palabras en total.

${DOCTRINA_HEADLINE}

${TEST_RECHAZO}

${DESTACADO_GUIA}`
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

  /*
   * EL TITULAR IMPRESO ES EL APROBADO. Letra por letra.
   *
   * Al derivador se le pide que corte el titular en líneas, no que lo edite, y
   * casi siempre cumple. "Casi siempre" no alcanza para un texto que se
   * publica: acá se compara lo que volvió contra lo que el plan aprobó —sin
   * mirar tildes ni mayúsculas, que es lo único que el modelo puede cambiar sin
   * mala intención— y si no es lo mismo se descarta el corte y se reparte a
   * mano. El corte es una decisión de composición; el TEXTO no se negocia.
   */
  const aprobado = limpiarTitular(opcion.headline ?? "")
  if (aprobado) {
    const devuelto = limpiarTitular(variables.headline.join(" "))
    if (plano(devuelto) !== plano(aprobado)) {
      console.warn(
        `[slot/prompt-feed] el derivador cambió el titular; se repone el del plan.\n` +
          `  plan:      "${aprobado}"\n  derivador: "${devuelto}"`
      )
      variables = { ...variables, headline: cortarHeadline(aprobado) }
    }
  }

  // Sin titular la pieza no se puede imprimir. Antes de fallar se corta a mano el
  // titular escrito en el plan, y recién si no hay, el título interno: es peor
  // que lo que devuelve el modelo, pero once piezas del lote no se pierden porque
  // una llamada de texto falló.
  if (!variablesUsables(variables)) {
    variables = { ...variables, headline: cortarHeadline(opcion.headline || opcion.titulo) }
  }

  if (!variablesUsables(variables)) {
    return NextResponse.json({ error: "No se pudo armar el titular" }, { status: 500 })
  }

  /*
   * Las dos garantías que la pieza no puede perder, resueltas antes de devolver
   * las variables y no dentro del renderizador: así el prompt del template, la
   * placa y la previsualización ven exactamente el mismo texto.
   *
   * · El rótulo: el rubro del template cuando el modelo no propuso ninguno.
   * · El azul: recalculado sobre el titular DEFINITIVO. Si el titular se repuso
   *   arriba, el destacado que había elegido el modelo puede haber quedado
   *   apuntando a un texto que ya no existe.
   */
  variables = {
    ...variables,
    category: variables.category || template.rubro,
    destacado: tramoAzul(variables.headline.join(" "), variables.destacado),
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
  const headlineEscrito = typeof opcion.headline === "string" ? opcion.headline.trim() : ""

  /*
   * La bajada se pide SIEMPRE, la liste el template o no.
   *
   * Es el bloque que llena la columna cuando la pieza no tiene servicios ni
   * cifra — el caso de seis de los quince tipos. Atarla al `pide` del template
   * sería dejar justo a esos seis sin ella, que son los que la necesitan.
   * Si al final hay ítems, la placa la ignora: comparten banda.
   */
  const pedido = [
    ...campos.map((c) => (c === "headline" ? instruccionHeadline(headlineEscrito) : INSTRUCCION[c])),
    // El rubro y la bajada se piden SIEMPRE, los liste el template o no. Son los
    // dos elementos que toda pieza lleva, y atarlos al `pide` de cada template
    // es dejar que un olvido decida el feed: seis de los quince no pedían
    // "category", y esas seis salían sin rótulo arriba del titular por
    // construcción, no por casualidad.
    INSTRUCCION.category,
    INSTRUCCION.bajada,
  ].join("\n")

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 800,
    messages: [
      {
        role: "user",
        content: `${VOCABULARIO_ACCEDRA}

Sos el director de arte de Accedra. La publicación ya está escrita; tu trabajo es traducirla a las variables de un template visual.${
          headlineEscrito
            ? " No estás escribiendo contenido nuevo: el titular ya viene decidido y se respeta tal cual."
            : " Esta publicación es de un plan viejo y no trae titular escrito, así que el titular sí lo redactás vos, con las reglas de abajo."
        }

LA PUBLICACIÓN
- Título interno: "${opcion.titulo}"${opcion.tesis ? `\n- Tesis que defiende: "${opcion.tesis}"` : ""}
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
