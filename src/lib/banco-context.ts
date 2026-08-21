/**
 * El banco de contenido: piezas sueltas, generadas de a lotes, sin fecha.
 *
 * Es el otro flujo, no el reemplazo del calendario de 15 días. La diferencia es
 * CUÁNDO se decide la fecha. En un plan la fecha viene primero —se arma un arco
 * cerrado y cada pieza nace con su día— y eso obliga a aceptar o descartar el
 * conjunto entero. Acá se genera un lote, se mira, se edita lo que haya que
 * editar, y recién lo que convence se programa. Lo que no convence se borra y no
 * deja un agujero en ninguna grilla.
 *
 * Todo lo que una pieza necesita para existir —la idea, el copy, el template, la
 * imagen— ya estaba modelado para el calendario y se reusa tal cual: una pieza
 * del banco ES un `content_slots`, con `origen = 'banco'` y sin fecha. Eso no es
 * un atajo de base de datos: es lo que hace que la generación de la imagen sea
 * literalmente la misma que ya funciona, sin una sola rama nueva.
 */

import {
  etiquetaDia,
  sumarDias,
  type Canal,
  type Contenido,
  type Opcion,
} from "@/lib/calendario-context"

/**
 * Cuántas piezas trae un lote.
 *
 * Ocho y no once como el plan: un lote se revisa de una sentada, y la revisión
 * es el trabajo real —leer ocho copys, editar tres, descartar uno—. Un lote que
 * no se termina de revisar es un banco que se llena de piezas que nadie miró.
 */
export const PIEZAS_POR_LOTE = 8

/** Los dos bancos. Son independientes: se generan, se revisan y se llenan aparte. */
export const CANALES_BANCO: Canal[] = ["linkedin", "meta"]

/**
 * Cómo se llama cada banco en pantalla.
 *
 * "Instagram" y no "Instagram + Facebook" como en el calendario: acá el usuario
 * está eligiendo una pestaña, no leyendo dónde se publica. La pieza sigue
 * sirviendo para los dos —es el mismo canal `meta` de siempre— y eso se dice en
 * el subtítulo de la pestaña, no en su nombre.
 */
export const BANCO_LABEL: Record<Canal, string> = {
  linkedin: "LinkedIn",
  meta: "Instagram",
}

export const BANCO_NOTA: Record<Canal, string> = {
  linkedin: "Texto largo y argumentado para decisores de IT",
  meta: "Texto corto y visual. La misma pieza sirve para Facebook",
}

/* ── La pieza ─────────────────────────────────────────────────────────────── */

export type PiezaBanco = {
  id: string
  canal: Canal
  /** El orden dentro del banco. Es el de generación y no cambia. */
  orden: number
  /**
   * La idea: titular impreso, tesis, ángulo, qué se ve.
   *
   * Es exactamente el mismo `Opcion` del calendario, y a propósito: si acá fuera
   * un tipo parecido pero distinto, el día que el plan sume un campo el banco se
   * quedaría atrás sin que nadie lo note.
   */
  idea: Opcion
  /** El copy publicable. Null hasta que se genera. */
  contenido: Contenido | null
  templateSlug: string | null
  imagenPath: string | null
  /** URL firmada de `imagenPath`. Temporal: se pide en cada lectura. */
  imagenUrl: string | null
  /** La fecha en la que se publica. Null = todavía está en el banco. */
  programada: string | null
  createdAt: string
}

/** Una pieza está lista para programarse cuando tiene las dos mitades. */
export function piezaCompleta(p: PiezaBanco): boolean {
  return Boolean(p.contenido?.caption && p.imagenUrl)
}

/* ── Cuándo se publica ────────────────────────────────────────────────────── */

/**
 * Cada cuántos días se publica.
 *
 * El paso es de dos días y los fines de semana lo estiran a tres. No es una
 * regla y una excepción: es UNA regla —"pasado mañana, y si cae sábado o
 * domingo, el lunes"— que produce lunes, miércoles y viernes, tres piezas por
 * semana con saltos de 2, 2 y 3.
 *
 * El salto de fin de semana es deliberado y no una limitación. Es un B2B: una
 * pieza publicada un sábado le habla a decisores que no están mirando, y correrla
 * al lunes no le cuesta nada al plan.
 */
const PASO = 2

/**
 * La próxima fecha libre para publicar.
 *
 * Se calcula sobre lo que YA está programado y no sobre un contador: el usuario
 * puede haber movido una pieza a mano o haber devuelto otra al banco, y la
 * siguiente tiene que respetar esa decisión en vez de reconstruir la serie desde
 * cero.
 */
export function proximaPublicacion(ocupadas: string[], hoy: string): string {
  const usadas = new Set(ocupadas)

  // La última futura, no la última de todas: programar sobre un banco viejo
  // tiene que arrancar desde hoy y no desde donde quedó hace tres meses.
  const futuras = ocupadas.filter((f) => f >= hoy).sort()
  const ultima = futuras.at(-1) ?? null

  let candidata = sumarDias(ultima ?? hoy, ultima ? PASO : 1)

  // El día se corre hasta encontrar uno hábil y libre. El tope es una red contra
  // un banco con cientos de piezas en la misma semana, no un límite real.
  for (let i = 0; i < 400; i++) {
    if (!etiquetaDia(candidata).finDeSemana && !usadas.has(candidata)) return candidata
    candidata = sumarDias(candidata, 1)
  }

  return candidata
}

/* ── Edición del copy ─────────────────────────────────────────────────────── */

/**
 * Qué campos del copy se pueden editar a mano.
 *
 * El titular NO está en la lista, y es la decisión más importante de esta
 * pantalla: el titular ya está IMPRESO dentro del JPG. Dejarlo editable haría
 * que el texto de la pieza y el de la imagen digan cosas distintas sin que nada
 * lo avise, que es peor que no poder editarlo. Para cambiarlo hay que regenerar
 * la pieza.
 */
export const CAMPOS_EDITABLES = [
  { id: "caption", label: "Texto del post", filas: 12, max: 4000 },
  { id: "captionCorto", label: "Versión corta", filas: 3, max: 600 },
  { id: "hashtags", label: "Hashtags", filas: 2, max: 400 },
  { id: "cta", label: "Llamado a la acción", filas: 2, max: 300 },
] as const

export type CampoEditable = (typeof CAMPOS_EDITABLES)[number]["id"]

/** El texto que se copia y se pega en la red. Copy + hashtags, en ese orden. */
export function textoParaPublicar(contenido: Contenido | null): string {
  if (!contenido) return ""
  return [contenido.caption, contenido.cta, contenido.hashtags]
    .map((t) => (t ?? "").trim())
    .filter(Boolean)
    .join("\n\n")
}
