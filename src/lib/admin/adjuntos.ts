/**
 * Los archivos de un comprobante: el PDF de la factura, la foto del ticket.
 *
 * Hasta ahora la carga inteligente leía el archivo, extraía los datos y lo
 * tiraba. Seis meses después, cuando el contador pide el respaldo de una compra,
 * hay que ir a buscarlo al mail. El archivo es parte del comprobante.
 */

export type Adjunto = {
  id: string
  nombre: string
  tipoMime: string | null
  tamano: number | null
  createdAt: string
  /**
   * URL firmada, con vencimiento. No se guarda en la base: vence, y guardar algo
   * que deja de servir es peor que no guardarlo. Se pide cada vez que se lista.
   */
  url: string | null
}

/** Lo que se acepta. Un comprobante llega como PDF o como foto; cualquier otra
 *  cosa es un archivo que alguien arrastró por error. */
export const TIPOS_ADJUNTO = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
] as const

/** 15 MB. Un PDF de AFIP pesa menos de 200 KB y una foto de teléfono unos 5 MB;
 *  el techo está para frenar el video que alguien suba sin darse cuenta. */
export const TAMANO_MAX = 15 * 1024 * 1024

export function tipoAceptado(mime: string): boolean {
  return (TIPOS_ADJUNTO as readonly string[]).includes(mime)
}

/** `1,2 MB` · `340 KB`. */
export function formatearTamano(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "—"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toLocaleString("es-AR", { maximumFractionDigits: 1 })} MB`
}

/** Si se puede previsualizar en el navegador o solo descargar. */
export function esImagen(mime: string | null): boolean {
  return Boolean(mime?.startsWith("image/"))
}
