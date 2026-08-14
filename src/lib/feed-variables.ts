/**
 * Las variables que llenan los templates del camino 2.
 *
 * Los quince prompts de `templates-feed.ts` no describen una publicación: son
 * moldes con huecos ([HEADLINE], [SERVICE n], [XX%], [DATE]…). Alguien tiene que
 * traducir la pieza ya escrita —título, ángulo, caption— a esos huecos.
 *
 * Lo hace un modelo, pero NO a mano libre: contra el catálogo real de
 * accedra.com.ar, que ya está volcado en el Brand Kit. La diferencia importa
 * porque estas piezas se publican. Un servicio inventado en un caption se
 * corrige antes de postear; un "+35% de eficiencia" impreso dentro de una imagen
 * ya no se corrige, y el propio kit lo prohíbe: solo cifras ya publicadas.
 */

import { CASOS, CLAIMS, CLIENTES, PARTNERS, SERVICIOS } from "@/lib/brand-kit"
import { sanitizeText } from "@/lib/contenido-context"

export type VariablesFeed = {
  /** El titular, ya cortado en las líneas con las que se va a imprimir. */
  headline: string[]
  /** Las palabras del titular que van en azul. Tienen que estar en el titular. */
  destacado: string
  /** El rótulo chiquito de arriba. Vacío si el template no lo pide. */
  category: string
  /** Etiquetas de servicio, del catálogo. */
  servicios: string[]
  /** Capacidades o beneficios, en dos o tres palabras cada uno. */
  features: string[]
  /** La cifra, tal como sale publicada: "99,99%", "5→<1", "+1.260". */
  metrica: string
  /** Qué mide esa cifra. */
  metricaLabel: string
  cta: string
  fecha: string
  lugar: string
  /** Stand, sala o código del evento. */
  codigo: string
  partner: string
  partnerNivel: string
  clientes: string[]
}

export const VARIABLES_VACIAS: VariablesFeed = {
  headline: [],
  destacado: "",
  category: "",
  servicios: [],
  features: [],
  metrica: "",
  metricaLabel: "",
  cta: "",
  fecha: "",
  lugar: "",
  codigo: "",
  partner: "",
  partnerNivel: "",
  clientes: [],
}

/**
 * El catálogo con el que se llenan los huecos, armado desde el Brand Kit.
 *
 * Se arma acá y no se escribe a mano por lo mismo de siempre: el kit ya es el
 * espejo de la landing, y una segunda lista escrita aparte queda vieja el día
 * que Accedra suma un servicio.
 */
export const VOCABULARIO_ACCEDRA = `CATÁLOGO REAL DE ACCEDRA — todo lo que escribas en las variables sale de acá. No inventes servicios, cifras, clientes ni partners.

SERVICIOS (el nombre de la línea y lo que incluye):
${SERVICIOS.map((s) => `- ${s.nombre}: ${s.items.join(" · ")}`).join("\n")}

TECNOLOGÍAS POR LÍNEA:
${SERVICIOS.map((s) => `- ${s.nombre}: ${s.tech.join(", ")}`).join("\n")}

CIFRAS PUBLICADAS (las únicas que se pueden imprimir en una pieza):
${CLAIMS.libres.map((c) => `- ${c}`).join("\n")}
${CASOS.flatMap((c) => c.metricas.map((m) => `- ${m.valor} ${m.label} (caso ${c.cliente})`)).join("\n")}

CLIENTES PÚBLICOS: ${CLIENTES.join(", ")}

PARTNERS: ${PARTNERS.map((p) => p.nombre).join(", ")}`

/* ── Normalización ────────────────────────────────────────────────────────── */

const MAX_LINEAS_HEADLINE = 4

function texto(v: unknown, max: number): string {
  return sanitizeText(v, max)
}

function lista(v: unknown, cantidad: number, max: number): string[] {
  if (!Array.isArray(v)) return []
  return v
    .map((x) => texto(x, max))
    .filter(Boolean)
    .slice(0, cantidad)
}

/**
 * Deja las variables en un estado imprimible.
 *
 * Todo lo que no venga se queda vacío y el template lo omite, en vez de dejar el
 * corchete: una pieza que sale con "[SERVICE 2]" impreso es una pieza tirada, y
 * el modelo de imágenes copia literalmente lo que ve entre comillas.
 */
export function normalizarVariables(raw: unknown): VariablesFeed {
  const o = (raw ?? {}) as Record<string, unknown>

  // El titular puede venir como array de líneas o como una sola cadena con
  // saltos: el modelo alterna entre las dos formas y las dos son razonables.
  const crudo = Array.isArray(o.headline)
    ? o.headline
    : String(o.headline ?? "")
        .split("\n")
        .filter(Boolean)

  const headline = lista(crudo, MAX_LINEAS_HEADLINE, 40)

  const destacado = texto(o.destacado, 40)
  const enTitular = headline.join(" ").toLowerCase()

  return {
    headline,
    // Un destacado que no está en el titular hace que el generador lo escriba
    // aparte, como una segunda línea de texto suelta. Si no coincide, se cae.
    destacado: destacado && enTitular.includes(destacado.toLowerCase()) ? destacado : "",
    category: texto(o.category, 24),
    servicios: lista(o.servicios, 4, 28),
    features: lista(o.features, 3, 28),
    metrica: texto(o.metrica, 16),
    metricaLabel: texto(o.metricaLabel, 32),
    cta: texto(o.cta, 40),
    fecha: texto(o.fecha, 32),
    lugar: texto(o.lugar, 40),
    codigo: texto(o.codigo, 24),
    partner: texto(o.partner, 32),
    partnerNivel: texto(o.partnerNivel, 40),
    clientes: lista(o.clientes, 6, 24),
  }
}

/** Si no hay titular no hay pieza: es el único campo sin el cual no se genera. */
export function variablesUsables(v: VariablesFeed): boolean {
  return v.headline.length > 0
}
