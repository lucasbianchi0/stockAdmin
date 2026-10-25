/**
 * Cierre de períodos — lo que comparten la pantalla y la API.
 *
 * El candado vive en la base (migración 20261025_02): todo lo que tenga fecha
 * contable hasta `hasta` inclusive no se carga, no se edita y no se borra. Acá
 * solo están los tipos y las cuentas de meses, que se hacen cortando cadenas
 * por lo mismo que explica `fecha.ts`: `new Date("2026-09-30")` en Argentina
 * es el 29.
 */

/** El SQLSTATE con el que la base rechaza algo de un período cerrado. */
export const CODIGO_PERIODO_CERRADO = "PC001"

export type MovimientoCierre = {
  id: number
  accion: "cierre" | "reapertura"
  /** Cerrado hasta este día después del movimiento; null = todo abierto. */
  hasta: string | null
  motivo: string | null
  fecha: string
  usuario: string
}

export type EstadoCierre = {
  hasta: string | null
  historial: MovimientoCierre[]
  /** Si quien mira puede reabrir. Cerrar puede cualquiera de Administración. */
  puedeReabrir: boolean
}

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

export function esMes(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v)
}

/** `2026-09` → `2026-09-30`. El día 0 del mes siguiente es el último de este,
 *  y con el constructor de tres argumentos no hay huso horario de por medio. */
export function finDeMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number)
  const dia = new Date(a, m, 0).getDate()
  return `${mes}-${String(dia).padStart(2, "0")}`
}

/** `2026-09-30` → `2026-09`. */
export function mesDe(iso: string): string {
  return iso.slice(0, 7)
}

/** `2026-09` → `2026-08`. */
export function mesAnterior(mes: string): string {
  const [a, m] = mes.split("-").map(Number)
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`
}

/** `2026-09` → `septiembre de 2026`. */
export function nombreMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number)
  return `${MESES[m - 1]} de ${a}`
}

/** `2026-09-30` → `30/09/2026`, que es como lo dice el mensaje de la base. */
export function fechaCierre(iso: string): string {
  const [a, m, d] = iso.split("-")
  return `${d}/${m}/${a}`
}
