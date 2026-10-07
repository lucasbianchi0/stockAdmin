import { normalizeIva } from "@/lib/iva"

/**
 * El precio mínimo de Nuestros Productos: por debajo de esto, publicar pierde
 * plata. Vive acá y no en la tabla porque el asistente hace la misma cuenta
 * para contestar sobre el semáforo, y dos copias de una fórmula terminan
 * diciendo dos cosas distintas.
 *
 *     Precio mínimo = ((Costo × (1 − Convenio) × T/C) × 1,155 × Margen × (1 + IVA)) + $8.000
 */

export const COEFICIENTE_FIJO = 1.155
export const ENVIO_FIJO = 8000

/**
 * El costo después del convenio. Si Distecna lo lista a 10 y hay convenio del
 * 20 %, el costo que cuenta es 8. Sin convenio (nulo) es el costo de lista.
 */
export function costoConConvenio(costo: number, convenioPct: number | null | undefined): number {
  if (!convenioPct || convenioPct <= 0) return costo
  return costo * (1 - convenioPct / 100)
}

export function calcPrecioMinimo(p: {
  costo: number
  dolar: number
  margen: number
  iva: number
  convenioPct?: number | null
}): number {
  const costo = costoConConvenio(p.costo, p.convenioPct)
  return costo * p.dolar * COEFICIENTE_FIJO * p.margen * (1 + normalizeIva(p.iva)) + ENVIO_FIJO
}
