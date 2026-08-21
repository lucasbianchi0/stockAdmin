/**
 * El control de calidad del titular impreso, compartido por los dos flujos.
 *
 * Vive acá y no dentro de la ruta del plan porque el banco de contenido genera
 * exactamente la misma clase de idea y necesita exactamente la misma garantía.
 * Dos copias de esta lógica serían dos calidades distintas de titular saliendo
 * de la misma marca, y la que se quedara vieja no fallaría: publicaría peor, que
 * es la forma en la que este sistema siempre se rompió.
 */

import Anthropic from "@anthropic-ai/sdk"

import {
  HEADLINE_MAX_CARACTERES,
  ajustarTitular,
  limpiarTitular,
} from "@/lib/copy-headline"
import type { Opcion } from "@/lib/calendario-context"

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/**
 * Los titulares que se pasaron del presupuesto, reescritos en vez de cortados.
 *
 * ES EL CAMBIO DE FONDO de todo esto. El techo de caracteres se le pedía al
 * modelo —"contá los caracteres antes de entregar"— y un modelo no cuenta
 * caracteres: tokeniza. Cuando no cumplía, el servidor lo resolvía amputando en
 * silencio, así que el incumplimiento nunca volvía al único que podía
 * arreglarlo. Corregir contra una medición concreta —"tiene 63, el techo es
 * 50"— es una tarea que sí se puede cumplir.
 *
 * Va en UNA sola llamada para todas las ideas, no una por pieza: son ocho o
 * doce titulares, entran holgados en un pedido y las dos rutas que la usan ya
 * viven contra el reloj del timeout. Si la llamada falla o vuelve incompleta,
 * cada titular que quedó fuera de presupuesto cae a `ajustarTitular`, que suelta
 * oraciones enteras y nunca deja una frase por la mitad.
 *
 * Muta las ideas en el lugar, como el resto de la normalización de las rutas
 * que la llaman.
 */
export async function repararTitulares(ideas: Opcion[]): Promise<void> {
  const largos = ideas.flatMap((opcion, i) =>
    opcion.headline.length > HEADLINE_MAX_CARACTERES ? [{ clave: String(i), opcion }] : []
  )

  if (largos.length === 0) return

  const reescritos = await pedirTitularesCortos(largos).catch((err) => {
    console.error("[titulares reparar]", err)
    return new Map<string, string>()
  })

  for (const { clave, opcion } of largos) {
    const propuesto = limpiarTitular(reescritos.get(clave) ?? "")

    // El reintento solo se acepta si CUMPLE. Un titular reescrito que sigue
    // pasado no es una mejora, es la misma respuesta con otras palabras.
    if (propuesto && propuesto.length <= HEADLINE_MAX_CARACTERES) {
      opcion.headline = propuesto
      continue
    }

    const ajustado = ajustarTitular(opcion.headline)
    if (ajustado.length <= HEADLINE_MAX_CARACTERES) {
      opcion.headline = ajustado
      continue
    }

    // Ni el modelo ni el corte por oraciones pudieron: el titular queda ENTERO.
    // Sale con la letra unos píxeles más chica y queda registrado. Es la única
    // salida honesta — un titular más chico es un problema de grilla, uno
    // recortado dice otra cosa.
    console.warn(
      `[titulares] titular fuera de presupuesto (${opcion.headline.length} de ` +
        `${HEADLINE_MAX_CARACTERES}), se publica entero: "${opcion.headline}"`
    )
  }
}

/** La llamada de reparación. Corta y barata: solo titulares, ningún contexto de más. */
async function pedirTitularesCortos(
  largos: { clave: string; opcion: Opcion }[]
): Promise<Map<string, string>> {
  const lista = largos
    .map(
      ({ clave, opcion }) =>
        `- id "${clave}" · ${opcion.headline.length} caracteres · patrón "${opcion.patron || "sin declarar"}"\n` +
        `  titular: "${opcion.headline}"\n` +
        `  tesis que defiende: "${opcion.tesis}"`
    )
    .join("\n")

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: `Estos titulares de Accedra se pasaron del techo de ${HEADLINE_MAX_CARACTERES} caracteres. Reescribilos para que entren.

${lista}

Cómo se acorta un titular sin arruinarlo:
- Se sacan palabras, no ideas. El titular tiene que seguir defendiendo la misma tesis y conservar el patrón con el que fue escrito.
- Si son dos oraciones y una sola ya dice lo importante, quedate con esa.
- La cifra o el nombre propio NO se tocan: son lo único que hace que el titular lo pueda firmar solo Accedra.
- Nunca lo dejes colgado: un titular que termina en artículo, preposición o conjunción ("…400 sucursales. Un") está mal, aunque entre.
- Sin emojis, sin hashtags, sin signos de exclamación, sin comillas adentro. Español argentino.

CONTÁ LOS CARACTERES DE CADA UNO antes de contestar, espacios y puntuación incluidos, y devolvé la cuenta junto al titular. Un titular de ${HEADLINE_MAX_CARACTERES + 1} caracteres no sirve.

Devolvé SOLO este JSON, sin markdown ni texto alrededor:
{"titulares": [{"id": "...", "titular": "...", "caracteres": 0}]}`,
      },
    ],
  })

  const text = message.content[0]?.type === "text" ? message.content[0].text : ""
  const desde = text.indexOf("{")
  const hasta = text.lastIndexOf("}")
  if (desde === -1 || hasta <= desde) return new Map()

  const parsed = JSON.parse(text.slice(desde, hasta + 1)) as { titulares?: unknown }
  if (!Array.isArray(parsed.titulares)) return new Map()

  const salida = new Map<string, string>()
  for (const fila of parsed.titulares) {
    if (!fila || typeof fila !== "object") continue
    const { id, titular } = fila as Record<string, unknown>
    if (typeof id === "string" && typeof titular === "string") salida.set(id, titular)
  }

  return salida
}
