// Tasas de IVA vigentes en Argentina, como fracción.
const IVA_RATES = [0, 0.025, 0.05, 0.105, 0.21, 0.27]

// El feed del proveedor no siempre manda la tasa exacta (llega 0,11 en lugar de
// 0,105), así que la ajustamos a la tasa legal más cercana. De esa forma el valor
// que se muestra y el que entra al precio mínimo son siempre el mismo.
const SNAP_TOLERANCE = 0.01

export function normalizeIva(raw: number | null | undefined): number {
  if (!raw || !Number.isFinite(raw)) return 0

  // algunos registros vienen como porcentaje entero (21) y no como fracción (0,21)
  const fraction = raw > 1 ? raw / 100 : raw

  const nearest = IVA_RATES.reduce((best, rate) =>
    Math.abs(rate - fraction) < Math.abs(best - fraction) ? rate : best
  )

  return Math.abs(nearest - fraction) <= SNAP_TOLERANCE ? nearest : fraction
}

export function formatIva(
  raw: number | null | undefined,
  fallback = "—"
): string {
  const iva = normalizeIva(raw)
  if (!iva) return fallback
  return `${(iva * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`
}
