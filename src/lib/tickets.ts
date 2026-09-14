/**
 * Ticketera — tipos, columnas y paleta.
 *
 * Sin imports de servidor: lo comparten el tablero, el diálogo y los handlers
 * de API, y así las dos puntas validan con la misma función en vez de con dos
 * copias que se separan al primer cambio.
 */

/* ── Columnas ─────────────────────────────────────────────────────────────── */

/** Las tres columnas, de izquierda a derecha. El orden no es alfabético ni una
 *  preferencia: es el recorrido de una tarea. */
export const ESTADOS_TABLERO = ["backlog", "progreso", "hecho"] as const
export type EstadoTablero = (typeof ESTADOS_TABLERO)[number]

/**
 * Los cuatro estados. El cuarto, `archivado`, no es una columna: es la salida
 * del tablero.
 *
 * Se archiva desde Hecho, y el ticket desaparece de la vista — que es el único
 * motivo por el que existe. Sin esto, la tercera columna acumula meses de
 * tarjetas y lo que se terminó esta semana queda enterrado entre lo de marzo.
 * Los archivados siguen estando, en la lista de abajo, y vuelven a Hecho de un
 * click: archivar no es borrar.
 */
export const ESTADOS = [...ESTADOS_TABLERO, "archivado"] as const
export type Estado = (typeof ESTADOS)[number]

export const ESTADO_LABEL: Record<Estado, string> = {
  backlog: "Backlog",
  progreso: "En progreso",
  hecho: "Hecho",
  archivado: "Archivado",
}

/** La frase bajo el título de la columna. Sin esto, "Backlog" y "En progreso"
 *  se usan como sinónimos y la primera columna se vuelve un depósito. */
export const ESTADO_PISTA: Record<Estado, string> = {
  backlog: "Anotado, todavía no empezó",
  progreso: "Alguien lo está haciendo ahora",
  hecho: "Terminado",
  archivado: "Terminado y guardado — sale del tablero",
}

export function esEstado(v: unknown): v is Estado {
  return typeof v === "string" && (ESTADOS as readonly string[]).includes(v)
}

export function esEstadoTablero(v: unknown): v is EstadoTablero {
  return typeof v === "string" && (ESTADOS_TABLERO as readonly string[]).includes(v)
}

/* ── Datos ────────────────────────────────────────────────────────────────── */

export type Proyecto = {
  id: string
  nombre: string
  /** Índice dentro de `COLORES`. */
  color: number
}

export type Ticket = {
  id: string
  titulo: string
  descripcion: string | null
  estado: Estado
  proyectoId: string | null
  autorId: string | null
  autorNombre: string
  asignadoId: string | null
  asignadoNombre: string | null
  orden: number
  /**
   * El agente que lo dictó, o `null` si lo anotó una persona.
   *
   * Se muestra en la tarjeta: un ticket que escribió un modelo es una
   * propuesta que todavía nadie revisó, y quien lo lee tiene que saberlo antes
   * de ponerse a hacerlo.
   */
  origenAgente: string | null
  /** Cuántas imágenes tiene. Va en la lista del tablero para poder dibujar el
   *  clip en la tarjeta sin pedir los adjuntos de cada una: cincuenta tarjetas
   *  serían cincuenta consultas para mostrar un ícono. */
  imagenes: number
  createdAt: string
  updatedAt: string
}

/**
 * Una imagen de un ticket: la captura del error, la foto del cable.
 *
 * `url` es firmada y con vencimiento, y por eso no se guarda en la base: vence,
 * y guardar algo que deja de servir es peor que no guardarlo. Se pide cada vez
 * que se abre el ticket.
 */
export type Imagen = {
  id: string
  nombre: string
  tipoMime: string | null
  tamano: number | null
  createdAt: string
  url: string | null
}

/** Alguien del equipo, para la fila de avatares y para asignar. */
export type Usuario = { id: string; nombre: string }

/** Quién está mirando. Sirve para dos cosas: preseleccionar el asignado en un
 *  ticket nuevo y marcar tu propio avatar. No es un permiso — acá edita
 *  cualquiera, que es justamente el punto de un tablero compartido. */
export type Yo = { id: string | null; nombre: string }

export const LIMITES = {
  titulo: 120,
  descripcion: 4000,
  proyecto: 40,
} as const

/* ── Imágenes ─────────────────────────────────────────────────────────────── */

/** Sólo imágenes. Un PDF o un .docx en un ticket es un adjunto de otra pantalla
 *  —los comprobantes tienen la suya—; acá lo que se sube es lo que se mira. */
export const TIPOS_IMAGEN = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
] as const

/** 10 MB. Una captura pesa menos de 1 MB y una foto de teléfono unos 5; el
 *  techo está para frenar el video que alguien arrastre sin darse cuenta. */
export const TAMANO_MAX = 10 * 1024 * 1024

export function tipoAceptado(mime: string): boolean {
  return (TIPOS_IMAGEN as readonly string[]).includes(mime)
}

/** `1,2 MB` · `340 KB`. */
export function formatearTamano(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "—"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toLocaleString("es-AR", { maximumFractionDigits: 1 })} MB`
}

/* ── Paleta ───────────────────────────────────────────────────────────────── */

/**
 * Ocho colores para proyectos y avatares.
 *
 * Se guarda el índice, no el color: la fila de la base dice "3" y qué es el 3
 * lo decide este archivo. Cambiar la paleta no toca ni un dato.
 *
 * Las clases van escritas enteras y no armadas con plantillas porque Tailwind
 * lee el código fuente como texto: un `bg-${x}-100` no existe en el CSS final.
 */
export const COLORES = [
  { chip: "border-blue-200 bg-blue-50 text-blue-700", punto: "bg-blue-500", avatar: "border-blue-200 bg-blue-100 text-blue-700" },
  { chip: "border-violet-200 bg-violet-50 text-violet-700", punto: "bg-violet-500", avatar: "border-violet-200 bg-violet-100 text-violet-700" },
  { chip: "border-emerald-200 bg-emerald-50 text-emerald-700", punto: "bg-emerald-500", avatar: "border-emerald-200 bg-emerald-100 text-emerald-700" },
  { chip: "border-amber-200 bg-amber-50 text-amber-700", punto: "bg-amber-500", avatar: "border-amber-200 bg-amber-100 text-amber-700" },
  { chip: "border-rose-200 bg-rose-50 text-rose-700", punto: "bg-rose-500", avatar: "border-rose-200 bg-rose-100 text-rose-700" },
  { chip: "border-cyan-200 bg-cyan-50 text-cyan-700", punto: "bg-cyan-500", avatar: "border-cyan-200 bg-cyan-100 text-cyan-700" },
  { chip: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700", punto: "bg-fuchsia-500", avatar: "border-fuchsia-200 bg-fuchsia-100 text-fuchsia-700" },
  { chip: "border-teal-200 bg-teal-50 text-teal-700", punto: "bg-teal-500", avatar: "border-teal-200 bg-teal-100 text-teal-700" },
] as const

export const colorDe = (i: number) => COLORES[((i % COLORES.length) + COLORES.length) % COLORES.length]

/**
 * El color de un avatar, derivado del id de la persona.
 *
 * Derivado y no guardado: así cada uno tiene siempre el mismo color en todas
 * las pantallas y en todas las sesiones, sin una columna más ni una decisión
 * que tomar al dar de alta a alguien.
 */
export function colorDeUsuario(id: string | null): (typeof COLORES)[number] {
  if (!id) return colorDe(0)
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return colorDe(h)
}

/* ── Borrador ─────────────────────────────────────────────────────────────── */

export type BorradorTicket = {
  titulo: string
  descripcion: string
  estado: Estado
  proyectoId: string | null
  asignadoId: string | null
}

export const borradorVacio = (estado: Estado = "backlog", asignadoId: string | null = null): BorradorTicket => ({
  titulo: "",
  descripcion: "",
  estado,
  proyectoId: null,
  asignadoId,
})

/** Lo único que no puede faltar es el título. Todo lo demás se completa
 *  después; un ticket a medias anotado vale más que uno perfecto que quedó sin
 *  escribir. */
export const faltaTitulo = (b: BorradorTicket) => !b.titulo.trim()

/* ── Presentación ─────────────────────────────────────────────────────────── */

/** Las primeras líneas de la descripción, para la tarjeta. Colapsa los saltos:
 *  una descripción que arranca con dos enters dejaría la tarjeta vacía. */
export function resumenDe(texto: string | null, max = 110): string {
  if (!texto) return ""
  const plano = texto.replace(/\s+/g, " ").trim()
  return plano.length > max ? `${plano.slice(0, max - 1).trimEnd()}…` : plano
}

/** "13 sep", y el año sólo si no es el corriente. */
export function fechaDeTicket(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const mismoAno = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    ...(mismoAno ? {} : { year: "numeric" }),
  })
}
