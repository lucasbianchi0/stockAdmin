/**
 * Lo que comparten las pantallas de marketing entre sí.
 *
 * Nació con las plantillas de mensajes y se movió acá cuando los brochures
 * necesitaron exactamente lo mismo: la misma fecha y las mismas etiquetas. No
 * son dos convenciones parecidas, es una sola vista en dos pantallas —si mañana
 * las etiquetas pasan a aceptar acentos, tienen que aceptarlos en las dos, y con
 * dos copias eso se descubre seis meses tarde.
 *
 * Sin imports de servidor: lo usan formularios, listas y handlers de API.
 */

/* ── Fecha ────────────────────────────────────────────────────────────────── */

/**
 * `2026-08-17T…` → `17 ago 2026`.
 *
 * Con zona y locale fijos porque este texto se pinta en el servidor y otra vez
 * en el cliente: si cada uno usara su zona, React tiraría un mismatch de
 * hidratación en cualquier registro creado después de las nueve de la noche.
 */
const FORMATO_FECHA = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "America/Argentina/Buenos_Aires",
})

export function fechaCorta(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return FORMATO_FECHA.format(d).replace(/\./g, "")
}

/* ── Etiquetas ────────────────────────────────────────────────────────────── */

export const LIMITE_ETIQUETA = 24
export const MAX_ETIQUETAS = 6

/**
 * Etiquetas en minúscula, sin repetir y sin las vacías.
 *
 * Minúscula porque "Cobranza" y "cobranza" como dos filtros distintos es
 * exactamente el problema que las etiquetas venían a resolver.
 */
export function normalizarEtiquetas(raw: unknown): string[] {
  const lista = Array.isArray(raw) ? raw : []
  const vistas = new Set<string>()

  for (const e of lista) {
    if (typeof e !== "string") continue
    const limpia = e.trim().toLowerCase().slice(0, LIMITE_ETIQUETA)
    if (limpia) vistas.add(limpia)
    if (vistas.size >= MAX_ETIQUETAS) break
  }

  return [...vistas]
}

/* ── Tamaño de archivo ────────────────────────────────────────────────────── */

/** `1,2 MB` · `340 KB`. */
export function formatearTamano(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "—"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toLocaleString("es-AR", { maximumFractionDigits: 1 })} MB`
}
