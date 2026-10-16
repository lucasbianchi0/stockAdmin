/**
 * Asientos que se cargan a mano o los propone el sistema: apertura, ajuste por
 * inflación y cierre del ejercicio.
 *
 * Lo que definió el contador el 15/10/2026: el ajuste por inflación y el asiento
 * de apertura los pasa el estudio; el ejercicio cierra el 31/8. El cierre lleva
 * las cuentas de resultado contra 410 Resultados del Ejercicio (a confirmar).
 *
 * En prueba se guardan como BORRADOR y no se registran en el libro diario.
 */

export const TIPOS_BORRADOR = ["apertura", "ajuste_inflacion", "cierre"] as const
export type TipoBorrador = (typeof TIPOS_BORRADOR)[number]

export const TIPO_BORRADOR_LABEL: Record<TipoBorrador, string> = {
  apertura: "Asiento de apertura",
  ajuste_inflacion: "Ajuste por inflación",
  cierre: "Asiento de cierre",
}

export type LineaBorrador = {
  cuentaId: string
  codigo: string
  nombre: string
  debe: number
  haber: number
  detalle: string | null
}

export type AsientoBorrador = {
  id: string
  tipo: TipoBorrador
  fecha: string
  descripcion: string
  lineas: LineaBorrador[]
  estado: "borrador" | "registrado" | "descartado"
  createdAt: string
  updatedAt: string
}

const r2 = (n: number) => Math.round(n * 100) / 100

/** Si cuadra y por cuánto no. Es lo primero que se muestra de un asiento. */
export function cuadre(lineas: Pick<LineaBorrador, "debe" | "haber">[]) {
  const debe = r2(lineas.reduce((s, l) => s + (l.debe || 0), 0))
  const haber = r2(lineas.reduce((s, l) => s + (l.haber || 0), 0))
  return { debe, haber, diferencia: r2(debe - haber), cuadra: Math.abs(debe - haber) < 0.005 && debe > 0 }
}

/** Lo que impide guardar un renglón, en palabras. `null` si está bien. */
export function problemaDeLinea(l: Pick<LineaBorrador, "cuentaId" | "debe" | "haber">): string | null {
  if (!l.cuentaId) return "Falta la cuenta"
  if (l.debe < 0 || l.haber < 0) return "Los importes van en positivo"
  if (l.debe > 0 && l.haber > 0) return "Va al debe o al haber, no a los dos"
  if (!l.debe && !l.haber) return "Falta el importe"
  return null
}
