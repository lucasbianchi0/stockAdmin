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
  /**
   * La bajada: una o dos frases que desarrollan el titular.
   *
   * Es el bloque de las piezas que no tienen nada que enumerar. Sin ella, seis de
   * los quince tipos salían con titular y nada más, y entre el 49% y el 74% de la
   * columna de texto quedaba vacía — el "dead zone" que el propio prompt del
   * fondo prohíbe y que nosotros no cumplíamos.
   */
  bajada: string
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
  bajada: "",
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
 * Una cifra que se puede imprimir a cuerpo gigante, o nada.
 *
 * El template de caso de éxito dibuja `metrica` como "the largest element of the
 * headline block", en azul y ocupando media pieza. Eso funciona con "99,99%" y
 * con "+1.260"; con "<1" sale un mayor-que del tamaño de una mano y la pieza se
 * tira. Pasó: el kit tiene la métrica de Andreani como "5→<1" —que es correcta
 * como dato— el prompt pedía quedarse "con el número final solo", y el número
 * final de "5→<1" es, literalmente, "<1".
 *
 * Por eso la regla vive acá y no en el prompt. Una instrucción de texto se puede
 * interpretar mal; una lista blanca no. Lo que no entra se devuelve vacío, y el
 * template omite el bloque entero en vez de imprimir un símbolo enorme.
 *
 * El salto de "5 caídas por semana a menos de 1 por mes" no se pierde: es un
 * titular, no una cifra suelta — el patrón "antes-despues" de `copy-headline.ts`
 * existe justamente para contarlo con palabras, que es donde se entiende.
 */
const CIFRA_LIMPIA = /^\+?\d{1,4}(?:[.,]\d{3})*(?:[.,]\d{1,2})?\s?%?$/
/** Las que se escriben como proporción y sí son legibles en grande: "24/7". */
const CIFRA_RATIO = /^\d{1,2}\/\d{1,2}$/

function cifra(v: unknown): string {
  const bruto = texto(v, 16).trim()
  if (!bruto) return ""
  return CIFRA_LIMPIA.test(bruto) || CIFRA_RATIO.test(bruto) ? bruto : ""
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

  // 56 y no 40. El tope viejo alcanzaba cuando el titular eran nueve palabras
  // cortadas de a tres; con catorce repartidas en dos líneas, una línea larga
  // ronda los 45 caracteres y se truncaba en silencio: la placa salía con la
  // frase cortada a la mitad y no había forma de saber por qué.
  const headline = lista(crudo, MAX_LINEAS_HEADLINE, 56)

  // Mismo motivo: el destacado pasó de "1 a 3 palabras" al remate de la frase,
  // que puede ser "Es el que ya tiene la llave". Truncado deja de coincidir con
  // el titular y el color split se cae entero.
  const destacado = texto(o.destacado, 56)
  const enTitular = headline.join(" ").toLowerCase()

  return {
    headline,
    // Un destacado que no está en el titular hace que el generador lo escriba
    // aparte, como una segunda línea de texto suelta. Si no coincide, se cae.
    destacado: destacado && enTitular.includes(destacado.toLowerCase()) ? destacado : "",
    category: texto(o.category, 24),
    // 180: dos o tres líneas al cuerpo de la bajada. Más largo no entra en la
    // banda y el renderizador lo desbordaría sobre el logo.
    bajada: texto(o.bajada, 180),
    servicios: lista(o.servicios, 4, 28),
    // 4 y no 3: con tres ítems el bloque no llega a cerrar contra el 76% de la
    // banda y queda flotando con un hueco abajo.
    features: lista(o.features, 4, 28),
    // La cifra pasa por la lista blanca, y su etiqueta cae con ella: "caídas de
    // red por mes" sin el número al lado no dice nada, y el template la dibuja
    // igual si está.
    metrica: cifra(o.metrica),
    // 64 y no 32: con el tope viejo "dispositivos de firma en 400 sucursales" se
    // imprimía como "…en 400 suc", cortado a mitad de palabra y publicable.
    metricaLabel: cifra(o.metrica) ? texto(o.metricaLabel, 64) : "",
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
