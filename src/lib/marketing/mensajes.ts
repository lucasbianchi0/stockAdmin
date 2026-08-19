/**
 * Plantillas de mensajes — tipos, catálogos y el motor de variables.
 *
 * Sin imports de servidor a propósito: lo usan el formulario, la lista y los
 * handlers de API. Si el día de mañana la validación de un campo vive solo del
 * lado del cliente, el endpoint acepta basura; teniendo las reglas acá, las dos
 * puntas validan igual porque validan con la misma función.
 */

import {
  LIMITE_ETIQUETA,
  MAX_ETIQUETAS,
  fechaCorta,
  normalizarEtiquetas,
} from "@/lib/marketing/formato"

// La fecha y las etiquetas se comparten con brochures — ver `formato.ts`. Se
// siguen exportando desde acá para que la pantalla de mensajes importe de un
// solo lado.
export { normalizarEtiquetas }
export const fechaDeMensaje = fechaCorta

/* ── Circunstancia ────────────────────────────────────────────────────────── */

/**
 * El orden es el del trato, de la primera vez que alguien escucha el nombre
 * Accedra hasta la factura cobrada. No es alfabético ni por frecuencia: es el
 * orden en que la persona que busca ya está pensando.
 */
export const CIRCUNSTANCIAS = [
  "prospeccion",
  "seguimiento",
  "cotizacion",
  "cierre",
  "postventa",
  "cobranza",
  "reactivacion",
  "interno",
  "otra",
] as const

export type Circunstancia = (typeof CIRCUNSTANCIAS)[number]

export const CIRCUNSTANCIA_LABEL: Record<Circunstancia, string> = {
  prospeccion: "Primer contacto",
  seguimiento: "Seguimiento",
  cotizacion: "Presupuesto",
  cierre: "Cierre",
  postventa: "Postventa",
  cobranza: "Cobranza",
  reactivacion: "Reactivación",
  interno: "Interno",
  otra: "Otra",
}

/** La frase que aparece bajo el rótulo al elegir. Sin esto, "Seguimiento" y
 *  "Reactivación" se pisan y cada uno clasifica como le parece. */
export const CIRCUNSTANCIA_PISTA: Record<Circunstancia, string> = {
  prospeccion: "Alguien que todavía no nos conoce",
  seguimiento: "Volver sobre algo que quedó abierto",
  cotizacion: "Enviar o explicar una propuesta",
  cierre: "Negociar y confirmar la orden",
  postventa: "Entrega, instalación y soporte",
  cobranza: "Recordar o reclamar un pago",
  reactivacion: "Un cliente que hace rato no compra",
  interno: "Puertas adentro del equipo",
  otra: "No entra en ninguna de las anteriores",
}

export function esCircunstancia(v: unknown): v is Circunstancia {
  return typeof v === "string" && (CIRCUNSTANCIAS as readonly string[]).includes(v)
}

/* ── Canal ────────────────────────────────────────────────────────────────── */

export const CANALES = ["whatsapp", "email", "linkedin", "llamada", "otro"] as const
export type Canal = (typeof CANALES)[number]

export const CANAL_LABEL: Record<Canal, string> = {
  whatsapp: "WhatsApp",
  email: "Email",
  linkedin: "LinkedIn",
  llamada: "Llamada",
  otro: "Otro",
}

/** El único canal con asunto. Se pregunta desde varios lugares, así que es una
 *  función y no un `=== "email"` repetido cuatro veces. */
export const llevaAsunto = (canal: Canal) => canal === "email"

export function esCanal(v: unknown): v is Canal {
  return typeof v === "string" && (CANALES as readonly string[]).includes(v)
}

/* ── La plantilla ─────────────────────────────────────────────────────────── */

export type MensajePlantilla = {
  id: string
  titulo: string
  circunstancia: Circunstancia
  canal: Canal
  asunto: string | null
  cuerpo: string
  cuandoUsar: string | null
  etiquetas: string[]
  autorId: string | null
  autorNombre: string
  editorNombre: string | null
  usos: number
  createdAt: string
  updatedAt: string
}

/** Quién está mirando la pantalla. Sirve para una sola cosa: marcar cuáles
 *  escribió esta persona. No es un permiso — editar puede cualquiera. */
export type Yo = { id: string | null; nombre: string }

/* ── Límites ──────────────────────────────────────────────────────────────── */

export const LIMITES = {
  titulo: 90,
  asunto: 160,
  cuerpo: 4000,
  cuandoUsar: 400,
  etiqueta: LIMITE_ETIQUETA,
  etiquetas: MAX_ETIQUETAS,
} as const

/* ── Variables ────────────────────────────────────────────────────────────── */

/**
 * `{{nombre}}`, `{{numero_factura}}`, `{{fecha de entrega}}`.
 *
 * Acepta espacios y acentos adentro porque el que escribe la plantilla no es
 * programador: si `{{razón social}}` no se reconociera, el hueco quedaría como
 * texto literal y alguien mandaría un mail que dice "Hola {{razón social}}".
 * Perdonar la sintaxis es más barato que ese mail.
 *
 * El límite de 40 caracteres evita que un `{{` suelto en el cuerpo se coma medio
 * mensaje buscando el cierre.
 */
const VARIABLE_RE = /\{\{\s*([\p{L}\p{N}_\- ]{1,40}?)\s*\}\}/gu

/** Las variables del texto, sin repetir y en el orden en que aparecen — que es
 *  el orden en que se completan. */
export function variablesDe(...textos: (string | null | undefined)[]): string[] {
  const vistas = new Set<string>()
  for (const texto of textos) {
    if (!texto) continue
    for (const m of texto.matchAll(VARIABLE_RE)) {
      const clave = m[1].trim()
      if (clave) vistas.add(clave)
    }
  }
  return [...vistas]
}

/**
 * Reemplaza lo que se completó y **deja intacto lo que no**.
 *
 * Borrar los huecos vacíos sería peor: un mensaje que dice "Hola ," se manda
 * igual sin que nadie lo note, mientras que uno que dice "Hola {{nombre}}," se
 * frena en la primera lectura.
 */
export function aplicarVariables(
  texto: string,
  valores: Record<string, string>
): string {
  return texto.replace(VARIABLE_RE, (original, clave: string) => {
    const valor = valores[clave.trim()]
    return valor && valor.trim() ? valor.trim() : original
  })
}

/** `numero_factura` → `Numero factura`. Para el rótulo del campo. */
export function rotuloDeVariable(clave: string): string {
  const limpio = clave.replace(/[_-]+/g, " ").trim()
  return limpio.charAt(0).toUpperCase() + limpio.slice(1)
}

/**
 * El texto partido en trozos literales y variables, para poder pintar los huecos
 * distinto sin meter HTML en un `dangerouslySetInnerHTML`.
 */
export type Trozo = { tipo: "texto" | "variable"; valor: string }

export function partirPorVariables(texto: string): Trozo[] {
  const trozos: Trozo[] = []
  let desde = 0

  for (const m of texto.matchAll(VARIABLE_RE)) {
    const inicio = m.index ?? 0
    if (inicio > desde) trozos.push({ tipo: "texto", valor: texto.slice(desde, inicio) })
    trozos.push({ tipo: "variable", valor: m[1].trim() })
    desde = inicio + m[0].length
  }

  if (desde < texto.length) trozos.push({ tipo: "texto", valor: texto.slice(desde) })
  return trozos
}

/* ── Presentación ─────────────────────────────────────────────────────────── */

/** Las primeras líneas, para la fila de la lista. Colapsa los saltos: un cuerpo
 *  que arranca con "Hola {{nombre}}," y dos enters dejaría la fila vacía. */
export function resumenDe(cuerpo: string, max = 120): string {
  const plano = cuerpo.replace(/\s+/g, " ").trim()
  return plano.length > max ? `${plano.slice(0, max - 1).trimEnd()}…` : plano
}

/* ── Normalización ────────────────────────────────────────────────────────── */

export type BorradorMensaje = {
  titulo: string
  circunstancia: Circunstancia
  canal: Canal
  asunto: string
  cuerpo: string
  cuandoUsar: string
  etiquetas: string[]
}

export const BORRADOR_VACIO: BorradorMensaje = {
  titulo: "",
  circunstancia: "prospeccion",
  canal: "whatsapp",
  asunto: "",
  cuerpo: "",
  cuandoUsar: "",
  etiquetas: [],
}

/** Qué le falta al borrador para poder guardarse. Vacío = está listo. */
export function faltantesDe(b: BorradorMensaje): string[] {
  const faltan: string[] = []
  if (!b.titulo.trim()) faltan.push("un título")
  if (!b.cuerpo.trim()) faltan.push("el mensaje")
  return faltan
}
