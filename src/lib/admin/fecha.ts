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

/**
 * `2026-08-01` + 30 → `2026-08-31`. Es la fecha de vencimiento que propone la
 * condición de pago de la ficha.
 *
 * Va por el constructor local de tres argumentos y no por `new Date(iso)` por lo
 * mismo que dice la cabecera: el parseo de un ISO pelado es UTC y en Argentina
 * devuelve el día anterior. Acá el corrimiento sería peor que en pantalla —
 * quedaría guardado en la base y el semáforo de vencidas mentiría un día.
 */
export function sumarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split("-").map(Number)
  if (!a || !m || !d) return iso
  const f = new Date(a, m - 1, d)
  f.setDate(f.getDate() + dias)
  const mes = String(f.getMonth() + 1).padStart(2, "0")
  const dia = String(f.getDate()).padStart(2, "0")
  return `${f.getFullYear()}-${mes}-${dia}`
}
