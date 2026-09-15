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

/**
 * Hoy en Argentina, como `YYYY-MM-DD`.
 *
 * `new Date().toISOString()` es UTC: desde las 21 h de Buenos Aires ya dice
 * mañana, y en el servidor de Vercel es UTC siempre. `en-CA` es el formato
 * que devuelve la fecha con guiones y en ese orden.
 */
export function hoyArgentina(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(
    new Date()
  )
}

/**
 * La plata no se mueve en el futuro. Un cobro, un pago o un movimiento de banco
 * lleva la fecha en que el dinero entró o salió de la cuenta, y el sistema no
 * maneja cheques diferidos. Una fecha posterior a hoy es un error de carga —
 * casi siempre el vencimiento de la factura tipeado en lugar del día del
 * cobro— y corre el saldo de "este mes", la conciliación y el mayor.
 */
export function esFechaFutura(iso: string): boolean {
  return iso > hoyArgentina()
}

export const ERROR_FECHA_FUTURA =
  "La fecha no puede ser posterior a hoy: es el día en que la plata entró o salió de la cuenta, no el vencimiento de la factura."

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
