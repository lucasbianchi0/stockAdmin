/**
 * Fechas de administración.
 *
 * Todas las fechas del módulo viajan como `YYYY-MM-DD` y se formatean cortando
 * la cadena, sin pasar por `new Date()`. Eso no es capricho: `new Date("2026-08-01")`
 * interpreta ISO como UTC y al mostrarlo en horario argentino devuelve el 31 de
 * julio. Un vencimiento corrido un día es un reclamo mal hecho.
 */

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
]

/** `2026-08-01` → `1/8/26`. Corto porque en una tabla la columna compite con
 *  datos que importan más, y el año de cuatro cifras no agrega nada. */
export function formatearFecha(iso: string | null): string {
  if (!iso) return "—"
  const [a, m, d] = iso.split("-")
  if (!a || !m || !d) return iso
  return `${Number(d)}/${Number(m)}/${a.slice(2)}`
}

/** `2026-08-01` → `1 de agosto de 2026`. Para el detalle, donde hay lugar y no
 *  hay que descifrar nada. */
export function formatearFechaLarga(iso: string | null): string {
  if (!iso) return "—"
  const [a, m, d] = iso.split("-").map(Number)
  if (!a || !m || !d) return iso
  return `${d} de ${MESES[m - 1]} de ${a}`
}
