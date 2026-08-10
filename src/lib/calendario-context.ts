/**
 * Calendario de contenido a 15 días.
 *
 * Vive aparte del Content Studio (`contenido-context.ts`) pero le pide prestado
 * todo lo que ya estaba resuelto: el contexto de marca, los sanitizers y los
 * límites. Duplicar el brief de Accedra en dos archivos garantiza que un día
 * queden distintos y nadie sepa cuál es el bueno.
 *
 * La diferencia de fondo con el Studio: allá se genera una pieza suelta a
 * pedido; acá se genera un arco de 15 días de una sola vez y después se elige
 * dentro de lo generado. Por eso el plan se guarda en la base y el Studio no.
 */

import { sanitizeText } from "@/lib/contenido-context"

export { ACCEDRA_BRAND_CONTEXT, sanitizeText } from "@/lib/contenido-context"

/* ── Canales ──────────────────────────────────────────────────────────────── */

/**
 * Instagram y Facebook son un solo canal ("meta") a propósito: se publica lo
 * mismo en los dos. Tratarlos por separado duplicaría cada caption para nada y
 * obligaría a elegir dos veces la misma opción.
 */
export const CANALES = ["linkedin", "meta"] as const
export type Canal = (typeof CANALES)[number]

export const CANAL_LABEL: Record<Canal, string> = {
  linkedin: "LinkedIn",
  meta: "Instagram + Facebook",
}

export const CANAL_CORTO: Record<Canal, string> = {
  linkedin: "LinkedIn",
  meta: "IG + FB",
}

/** Cómo se le explica cada canal a Claude. */
export const CANAL_BRIEF: Record<Canal, string> = {
  linkedin:
    "LinkedIn — el canal prioritario, es un negocio B2B. Audiencia: decisores de IT, gerentes y dueños de empresas medianas y grandes. Texto más largo y argumentado (150–250 palabras), sin emojis decorativos, con una idea técnica concreta. Nada de humo motivacional.",
  meta:
    "Instagram y Facebook con la MISMA pieza. Audiencia: más amplia y menos técnica, incluye equipo, candidatos y clientes actuales. Texto corto y escaneable (60–120 palabras), primera línea que frene el scroll, algún emoji con moderación. Lo visual pesa más que el texto.",
}

/**
 * Un solo formato: imagen.
 *
 * El plan antes ofrecía carrusel, reel, video y artículo. Cada uno de esos exige
 * una producción distinta —guion, filmación, diseño de ocho slides— y en la
 * práctica el calendario se trababa en la primera pieza que nadie podía
 * producir. Quince imágenes son quince piezas que salen; quince formatos
 * mezclados son un plan que se abandona en la semana dos.
 */
export const FORMATO_UNICO = "imagen"
export const VALID_FORMATOS = new Set([FORMATO_UNICO])

/* ── Audiencia ────────────────────────────────────────────────────────────── */

export const AUDIENCIAS = ["decisores", "negocio", "ambos"] as const
export type Audiencia = (typeof AUDIENCIAS)[number]

export const AUDIENCIA_LABEL: Record<Audiencia, string> = {
  decisores: "Decisores técnicos (IT, CTO, infraestructura)",
  negocio: "Decisores de negocio (dueños, gerencia, finanzas)",
  ambos: "Ambos perfiles",
}

/* ── Parámetros del plan ──────────────────────────────────────────────────── */

export const DIAS_PLAN = 15
export const OPCIONES_POR_IDEA = 3
export const CONTEXTO_MAX_LEN = 1200

/**
 * Cuántas publicaciones por canal entran en 15 días. No es una cuenta libre:
 * un calendario que propone 15 posts de LinkedIn es un calendario que nadie
 * cumple, y el plan deja de servir a la semana.
 */
export const POSTS_POR_CANAL: Record<Canal, number> = {
  linkedin: 6,
  meta: 5,
}

/* ── Tipos ────────────────────────────────────────────────────────────────── */

export type Opcion = {
  id: string
  titulo: string
  hook: string
  /** Una por slot. Sin una recomendación, tres opciones equivalentes trasladan
   *  la decisión entera al usuario y el plan tarda el triple en cerrarse. */
  recomendada: boolean
  /** Por qué esa es la recomendada. Una recomendación sin motivo no se discute
   *  ni se acepta: se ignora. */
  porQue: string
  /** De qué trata el posteo: el ángulo y qué se cuenta. */
  angulo: string
  /** Qué se va a ver en la pieza. Elegir a ciegas entre tres títulos no alcanza:
   *  la mitad del trabajo de una publicación es la imagen. */
  imagen: string
  formato: string
}

export type Contenido = {
  caption: string
  captionCorto: string
  hashtags: string
  cta: string
  promptImagen: string
}

export type Slot = {
  id: string
  fecha: string
  canal: Canal
  beat: string | null
  opciones: Opcion[]
  elegida: string | null
  contenido: Contenido | null
  /**
   * Qué template de composición le toca a esta pieza.
   *
   * Se decide al armar el plan y no al generar la imagen: sin saber qué forma va
   * a tener cada pieza no se puede dibujar el feed, y sin poder dibujarlo hay
   * que gastar once generaciones para descubrir que la grilla no cierra.
   *
   * Null en los planes anteriores a esto. Todo lo que lo lea tiene que tolerarlo.
   */
  templateSlug: string | null
  /** Ruta en el bucket `piezas`. La imagen real, la que ya se generó. */
  imagenPath: string | null
  /** URL firmada de `imagenPath`. Temporal: se pide en cada lectura. */
  imagenUrl: string | null
}

/**
 * Los estados por los que pasa un plan.
 *
 * Antes era un booleano `archivado`, que solo distinguía el plan de ahora de los
 * viejos. Pero un plan se arma antes de arrancar y se termina de publicar mucho
 * antes de que a alguien le interese esconderlo: con el booleano, "ya publiqué
 * todo" y "no lo quiero ver más" eran el mismo estado.
 */
export const ESTADOS = ["borrador", "activo", "terminado", "archivado"] as const
export type EstadoPlan = (typeof ESTADOS)[number]

export const ESTADO_LABEL: Record<EstadoPlan, string> = {
  borrador: "Borrador",
  activo: "Activo",
  terminado: "Terminado",
  archivado: "Archivado",
}

export function esEstado(v: unknown): v is EstadoPlan {
  return typeof v === "string" && (ESTADOS as readonly string[]).includes(v)
}

/** Los campos del plan que no dependen de haber cargado sus slots. */
export type PlanBase = {
  id: string
  titulo: string
  /** Cómo lo renombró el usuario. Manda sobre `titulo` cuando está. */
  nombre: string | null
  estado: EstadoPlan
  arco: string | null
  /** Lectura de marketer: por qué este reparto y no otro. */
  analisis: string | null
  fechaInicio: string
  dias: number
  canales: Canal[]
  contexto: string | null
  audiencia: Audiencia
  createdAt: string
}

export type Plan = PlanBase & {
  slots: Slot[]
}

/**
 * Un plan en la lista del home, sin traer sus slots.
 *
 * El avance viene contado por el servidor. Traer los slots enteros de diez
 * planes para contar cuántos tienen imagen serían miles de opciones y captions
 * viajando para dibujar una barrita.
 */
export type PlanResumen = PlanBase & {
  avance: AvancePlan
}

export type AvancePlan = {
  total: number
  elegidas: number
  conContenido: number
  conImagen: number
}

/** Cómo se llama el plan en pantalla. El usuario manda; si no tocó nada, el modelo. */
export function nombreDePlan(plan: { nombre: string | null; titulo: string }): string {
  return plan.nombre?.trim() || plan.titulo
}

/** El último día del plan. Se deriva y no se guarda: `dias` ya lo dice. */
export function fechaFinDe(plan: { fechaInicio: string; dias: number }): string {
  return sumarDias(plan.fechaInicio, Math.max(1, plan.dias) - 1)
}

/* ── Validación ───────────────────────────────────────────────────────────── */

export function esCanal(v: unknown): v is Canal {
  return typeof v === "string" && (CANALES as readonly string[]).includes(v)
}

export function esAudiencia(v: unknown): v is Audiencia {
  return typeof v === "string" && (AUDIENCIAS as readonly string[]).includes(v)
}

/** Acepta sólo `YYYY-MM-DD` y verifica que sea una fecha real, no sólo el molde. */
export function esFechaISO(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

export function sanitizarContexto(input: unknown): string {
  return sanitizeText(input, CONTEXTO_MAX_LEN)
}

/* ── Fechas ───────────────────────────────────────────────────────────────── */

/**
 * Todo el manejo de fechas es UTC a mediodía. Construir `new Date("2026-08-07")`
 * lo interpreta como UTC medianoche, que en Buenos Aires (UTC-3) es el día
 * anterior a las 21 h: el calendario entero se corre un día. Anclar a mediodía
 * deja margen para cualquier huso.
 */
export function aFecha(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`)
}

export function aISO(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function sumarDias(iso: string, dias: number): string {
  const d = aFecha(iso)
  d.setUTCDate(d.getUTCDate() + dias)
  return aISO(d)
}

export function hoyISO(): string {
  return aISO(new Date())
}

const DIA_CORTO = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"]
const MES_CORTO = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
]

export function etiquetaDia(iso: string) {
  const d = aFecha(iso)
  return {
    diaSemana: DIA_CORTO[d.getUTCDay()],
    numero: d.getUTCDate(),
    mes: MES_CORTO[d.getUTCMonth()],
    finDeSemana: d.getUTCDay() === 0 || d.getUTCDay() === 6,
  }
}

export function fechaLarga(iso: string) {
  const { diaSemana, numero, mes } = etiquetaDia(iso)
  return `${diaSemana} ${numero} de ${mes}`
}
