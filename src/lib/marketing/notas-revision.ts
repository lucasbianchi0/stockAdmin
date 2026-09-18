/**
 * La revisión de una nota con IA: qué se le pide, qué devuelve y cómo se arma
 * el pedido.
 *
 * Sin imports de servidor: los tipos los usa el editor y el esquema lo usa el
 * endpoint. La llamada a Anthropic vive en la ruta.
 *
 * ES OPCIONAL Y NO BLOQUEA
 *
 * Se dispara con un botón, nunca al guardar. Una nota se puede publicar sin
 * pasar por acá: esto es un lector externo antes de subir, no una aduana. La
 * razón de que exista es que el costo de publicar una nota floja no se ve el
 * día que se publica —la página sale igual— sino tres meses después, y para
 * entonces ya está indexada.
 *
 * QUÉ REVISA Y QUÉ NO
 *
 * No corrige la ortografía ni reescribe el texto. Mira las cinco cosas que
 * deciden si la nota sirve para lo que se escribió: si la respuesta directa
 * responde el título, si la estructura permite citar un fragmento suelto, si el
 * título y el resumen ganan el clic, si dice algo que Accedra no vende o no
 * puede afirmar, y si compite contra una nota que ya existe.
 */

import type { Faq } from "@/lib/marketing/notas"

/* ── Lo que devuelve ──────────────────────────────────────────────────────── */

export const AREAS = ["respuesta", "estructura", "seo", "geo", "riesgo", "enlaces"] as const
export type Area = (typeof AREAS)[number]

export const AREA_LABEL: Record<Area, string> = {
  respuesta: "La respuesta",
  estructura: "Estructura",
  seo: "Búsqueda",
  geo: "Citabilidad",
  riesgo: "Riesgo",
  enlaces: "Enlaces",
}

export const GRAVEDADES = ["alta", "media", "baja"] as const
export type Gravedad = (typeof GRAVEDADES)[number]

export const VEREDICTOS = ["publicar", "ajustar", "reescribir"] as const
export type Veredicto = (typeof VEREDICTOS)[number]

export const VEREDICTO_LABEL: Record<Veredicto, string> = {
  publicar: "Lista para publicar",
  ajustar: "Publicable con ajustes",
  reescribir: "Le falta trabajo",
}

export type Punto = {
  area: Area
  gravedad: Gravedad
  titulo: string
  detalle: string
  /** Qué escribir en lugar de lo que hay. Vacío cuando no aplica. */
  sugerencia: string
}

export type Revision = {
  veredicto: Veredicto
  resumen: string
  puntos: Punto[]
  /** Propuestas listas para aplicar con un clic. Vacías = sin propuesta. */
  tituloSeoSugerido: string
  resumenSugerido: string
  faqsSugeridas: Faq[]
}

/* ── El esquema que se le exige al modelo ─────────────────────────────────── */

/**
 * Salida estructurada (`output_config.format`). Todo es `required` y sin
 * propiedades extra: la API valida el JSON contra esto, así que el editor no
 * tiene que defenderse de una respuesta con otra forma.
 *
 * Los campos "sugeridos" van como string o lista vacía en vez de opcionales,
 * por lo mismo: un campo que a veces no viene obliga a chequear en cada uso.
 */
export const ESQUEMA_REVISION = {
  type: "object",
  properties: {
    veredicto: { type: "string", enum: [...VEREDICTOS] },
    resumen: { type: "string", description: "Una o dos oraciones: qué le falta a la nota, en criollo." },
    puntos: {
      type: "array",
      items: {
        type: "object",
        properties: {
          area: { type: "string", enum: [...AREAS] },
          gravedad: { type: "string", enum: [...GRAVEDADES] },
          titulo: { type: "string", description: "El problema en menos de 10 palabras." },
          detalle: { type: "string", description: "Por qué importa, en una o dos oraciones. Sin rodeos." },
          sugerencia: { type: "string", description: "Qué poner en su lugar, textual. Vacío si no aplica." },
        },
        required: ["area", "gravedad", "titulo", "detalle", "sugerencia"],
        additionalProperties: false,
      },
    },
    tituloSeoSugerido: { type: "string", description: "Título para Google de 60 caracteres o menos. Vacío si el que hay está bien." },
    resumenSugerido: { type: "string", description: "Meta description de 155 caracteres o menos. Vacío si el que hay está bien." },
    faqsSugeridas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          q: { type: "string" },
          a: { type: "string" },
        },
        required: ["q", "a"],
        additionalProperties: false,
      },
      description: "Preguntas frecuentes que faltan, con su respuesta. Lista vacía si las que hay alcanzan.",
    },
  },
  required: ["veredicto", "resumen", "puntos", "tituloSeoSugerido", "resumenSugerido", "faqsSugeridas"],
  additionalProperties: false,
} as const

/* ── El pedido ────────────────────────────────────────────────────────────── */

/**
 * Lo que el revisor tiene que saber de Accedra para que la revisión sirva.
 *
 * Las dos advertencias del final no son decorativas: el sitio dice en varios
 * lugares que Accedra vende conectividad satelital y no es cierto, y "firma
 * digital" a secas atrae a quien busca un token de AFIP, que no es un cliente.
 * Una nota que repita cualquiera de las dos cosas amplifica un error caro.
 */
export const CONTEXTO_REVISOR = `Accedra IT Solutions (Accedra S.A.) es un integrador de tecnología B2B argentino,
17 años, oficinas en Irala 1950, CABA. Vende a empresas medianas y grandes de Argentina.

Sus cinco soluciones:
- Firma Biométrica (es el fuerte): firma manuscrita biométrica con validez legal, tabletas Wacom,
  Namirial eSignAnywhere, Thales, factoring digital, firma mobile, integración con sistemas.
- Conectividad Crítica: cableado estructurado, redes Cisco/Meraki/Aruba, WiFi corporativo, energía.
- Consultoría Microsoft: Power BI, M365, Teams, Azure, Power Automate, licenciamiento CSP.
- Seguridad IT: NGFW Palo Alto y Cisco, Umbrella, endpoints, VPN, Zero Trust.
- Software & AI: software a medida e IA aplicada.

Casos publicados: Finning Argentina (dealer Caterpillar, minería, 15+ sitios) y Grupo Logístico
Andreani (de 5 caídas de red por semana a menos de 1 por mes).

DOS COSAS QUE NO SE PUEDEN AFIRMAR:
1. Accedra NO vende conectividad satelital ni Starlink. Si la nota lo dice o lo sugiere, es un error grave.
2. El producto es firma BIOMÉTRICA con validez legal. "Firma digital" a secas es otra cosa (token,
   certificado de AFIP) y atrae a gente que nunca va a comprar. Si la nota usa los términos como
   sinónimos sin explicar la diferencia, es un error.`

/** Los datos de la nota que viajan al revisor. */
export type NotaParaRevisar = {
  titulo: string
  tituloSeo: string
  resumen: string
  respuesta: string
  cuerpo: string
  categoria: string | null
  tags: string[]
  autor: string
  faqs: Faq[]
  fuentes: { titulo: string; url: string }[]
}

/**
 * El mensaje que se le manda.
 *
 * `otras` son los títulos de las notas que ya están publicadas. Van adentro del
 * pedido porque el problema más caro de un hub de contenido no es una nota
 * floja: es la segunda nota sobre el mismo tema, que se pelea con la primera
 * por la misma búsqueda y hace que Google no rankee ninguna de las dos.
 */
export function armarPedido(n: NotaParaRevisar, otras: string[]): string {
  const lista = (xs: string[]) => (xs.length ? xs.map((x) => `- ${x}`).join("\n") : "(ninguna)")

  return `${CONTEXTO_REVISOR}

Estas son las notas que YA están publicadas en accedra.com.ar/recursos:
${lista(otras)}

Revisá esta nota antes de que se publique.

TÍTULO: ${n.titulo}
TÍTULO PARA GOOGLE: ${n.tituloSeo || "(vacío: se usa el título)"}
RESUMEN (meta description): ${n.resumen || "(vacío)"}
SOLUCIÓN: ${n.categoria ?? "(ninguna)"}
AUTOR: ${n.autor || "(sin firmar)"}
TAGS: ${n.tags.join(", ") || "(ninguno)"}

RESPUESTA DIRECTA:
${n.respuesta || "(vacía)"}

CUERPO (markdown):
"""
${n.cuerpo}
"""

PREGUNTAS FRECUENTES:
${lista(n.faqs.map((f) => `${f.q} → ${f.a}`))}

FUENTES:
${lista(n.fuentes.map((f) => `${f.titulo} (${f.url})`))}

Revisá seis cosas, en este orden de importancia:

1. LA RESPUESTA. ¿La respuesta directa contesta el título en sus dos primeras oraciones, sin que
   haga falta leer el resto? Es lo que un modelo generativo copia cuando alguien pregunta el tema.
   Si es un preámbulo ("en este artículo vamos a ver…"), es un error grave.
2. ESTRUCTURA. ¿Los subtítulos (##) permiten citar un fragmento suelto? ¿Cada sección responde algo
   concreto o son títulos de relleno?
3. BÚSQUEDA. Título para Google de 60 caracteres o menos y meta description de 155 o menos, escritos
   para que alguien haga clic. ¿Compite con alguna de las notas ya publicadas de la lista de arriba?
   Si dos notas responden la misma pregunta, decilo: es el problema más caro de todos.
4. CITABILIDAD. ¿Hay algo propio —un dato, una cifra, un caso, una experiencia— que no esté en las
   otras diez páginas que responden lo mismo? Sin eso, ninguna IA la va a citar. ¿Las preguntas
   frecuentes están escritas como las diría una persona?
5. RIESGO. Afirmaciones que Accedra no puede sostener: cosas que no vende, promesas absolutas
   ("garantizamos", "100% seguro"), asesoramiento legal presentado como certeza, datos sin fuente.
6. ENLACES. ¿Enlaza a la página de su solución y a alguna landing por industria? ¿Los links externos
   son a fuentes serias y no a competidores?

Reglas de la respuesta:
- Máximo 8 puntos. Si algo está bien, no lo menciones: esto es una lista de lo que hay que arreglar.
- Gravedad alta sólo para lo que hace que la nota no sirva o le haga daño al sitio.
- En \`sugerencia\` escribí el texto de reemplazo, listo para pegar. No expliques, escribí.
- Hablá en español rioplatense, directo, sin adjetivos de marketing.
- Veredicto: "publicar" si sólo quedan detalles, "ajustar" si hay algo de gravedad media,
  "reescribir" si hay algo de gravedad alta.`
}

/* ── Saneo de la respuesta ────────────────────────────────────────────────── */

const esArea = (v: unknown): v is Area => typeof v === "string" && (AREAS as readonly string[]).includes(v)
const esGravedad = (v: unknown): v is Gravedad =>
  typeof v === "string" && (GRAVEDADES as readonly string[]).includes(v)

/**
 * El JSON del modelo → una revisión que el editor puede dibujar sin chequear
 * nada. La API valida el esquema, pero esto corre igual: una respuesta cortada
 * por `max_tokens` puede pasar la validación y llegar con campos raros, y esta
 * pantalla no es lugar para un "cannot read property of undefined".
 */
export function revisionDe(v: unknown): Revision | null {
  if (!v || typeof v !== "object") return null
  const r = v as Record<string, unknown>

  const veredicto = (VEREDICTOS as readonly string[]).includes(String(r.veredicto))
    ? (r.veredicto as Veredicto)
    : "ajustar"

  const texto = (x: unknown, max: number) => (typeof x === "string" ? x.trim().slice(0, max) : "")

  const puntos = Array.isArray(r.puntos)
    ? r.puntos
        .map((p) => (p && typeof p === "object" ? (p as Record<string, unknown>) : {}))
        .map((p) => ({
          area: esArea(p.area) ? p.area : ("estructura" as Area),
          gravedad: esGravedad(p.gravedad) ? p.gravedad : ("media" as Gravedad),
          titulo: texto(p.titulo, 120),
          detalle: texto(p.detalle, 600),
          sugerencia: texto(p.sugerencia, 1200),
        }))
        .filter((p) => p.titulo)
        .slice(0, 8)
    : []

  const faqsSugeridas = Array.isArray(r.faqsSugeridas)
    ? r.faqsSugeridas
        .map((f) => (f && typeof f === "object" ? (f as Record<string, unknown>) : {}))
        .map((f) => ({ q: texto(f.q, 140), a: texto(f.a, 600) }))
        .filter((f) => f.q && f.a)
        .slice(0, 6)
    : []

  return {
    veredicto,
    resumen: texto(r.resumen, 600),
    puntos,
    tituloSeoSugerido: texto(r.tituloSeoSugerido, 70),
    resumenSugerido: texto(r.resumenSugerido, 300),
    faqsSugeridas,
  }
}

/** El orden en que se muestran: primero lo que rompe. */
export function ordenarPuntos(puntos: Punto[]): Punto[] {
  const peso: Record<Gravedad, number> = { alta: 0, media: 1, baja: 2 }
  return [...puntos].sort((a, b) => peso[a.gravedad] - peso[b.gravedad])
}
