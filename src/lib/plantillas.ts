/**
 * Plantillas visuales — las referencias que copia el generador de imágenes.
 *
 * Una referencia le enseña al modelo el lenguaje visual mejor que cualquier
 * párrafo: probado contra la API, pasarle una pieza y pedirle otra escena
 * devuelve el mismo fondo, la misma luz y el mismo acento sin nombrarlos.
 *
 * Por eso la plantilla no es decoración del flujo: es lo que hace que quince
 * piezas parezcan de la misma marca en vez de quince imágenes sueltas.
 */

export const BUCKET_PLANTILLAS = "plantillas"

export const MIMES_PLANTILLA = ["image/jpeg", "image/png", "image/webp"] as const

/** 5 MB. Una referencia no necesita más: se reescala igual antes de viajar. */
export const PLANTILLA_MAX_BYTES = 5 * 1024 * 1024

export type Plantilla = {
  id: string
  nombre: string
  cuandoUsar: string | null
  /** La receta de estructura leída de la imagen. Es lo que se reutiliza. */
  composicion: string | null
  activa: boolean
  orden: number
  /** URL firmada, temporal. No se guarda: se pide en cada listado. */
  url: string | null
}

export function esMimeValido(m: unknown): m is (typeof MIMES_PLANTILLA)[number] {
  return typeof m === "string" && (MIMES_PLANTILLA as readonly string[]).includes(m)
}

/** Extensión a partir del mime, para que el archivo en Storage sea reconocible. */
export function extensionDe(mime: string): string {
  if (mime === "image/png") return "png"
  if (mime === "image/webp") return "webp"
  return "jpg"
}
