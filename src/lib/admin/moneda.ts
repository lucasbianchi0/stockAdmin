/**
 * Bimonetario — pesos y dólares en todo el módulo.
 *
 * La regla que sostiene el sistema: **un documento se guarda en su moneda y con
 * el tipo de cambio del día en que se cargó**. La otra moneda no se guarda como
 * dato suelto, se deriva. Y no se recalcula nunca: una factura de agosto sigue
 * valuada al dólar de agosto aunque hoy el dólar esté en otro lado — así lo
 * muestra el estado de cuenta que pidió administración, con TC distinto en cada
 * fila del mismo cliente.
 *
 * El TC es siempre "cuántos pesos vale un dólar" (dólar oficial venta del Banco
 * Nación). Nunca al revés: la mitad de los errores de conversión en un sistema
 * bimonetario son alguien dividiendo donde había que multiplicar, y la forma de
 * no tenerlos es que haya una sola dirección posible.
 */

export const MONEDAS = ["ARS", "USD"] as const
export type Moneda = (typeof MONEDAS)[number]

export const NOMBRE_MONEDA: Record<Moneda, string> = {
  ARS: "Pesos",
  USD: "Dólares",
}

export const SIMBOLO_MONEDA: Record<Moneda, string> = {
  ARS: "$",
  USD: "USD",
}

export function esMoneda(v: unknown): v is Moneda {
  return typeof v === "string" && MONEDAS.includes(v as Moneda)
}

/** La contraria. Se usa tanto que merece nombre propio. */
export function monedaOpuesta(m: Moneda): Moneda {
  return m === "ARS" ? "USD" : "ARS"
}

/* ── Conversión ───────────────────────────────────────────────────────────── */

/**
 * Redondeo a 2 decimales sin el error clásico del binario: `Math.round(x * 100)`
 * sobre 1.005 da 100 en lugar de 101 porque el float ya venía corrido. El
 * `Number(x.toFixed())` intermedio lo endereza antes de redondear.
 */
export function redondear(valor: number, decimales = 2): number {
  if (!Number.isFinite(valor)) return 0
  const f = 10 ** decimales
  return Math.round(Number((valor * f).toFixed(4))) / f
}

/** Un importe en la moneda que sea → pesos. `tc` es el dólar del documento. */
export function aPesos(importe: number, moneda: Moneda, tc: number): number {
  if (!Number.isFinite(importe)) return 0
  return moneda === "ARS" ? redondear(importe) : redondear(importe * (tc || 0))
}

/** Un importe en la moneda que sea → dólares. Sin TC no hay conversión posible. */
export function aDolares(importe: number, moneda: Moneda, tc: number): number {
  if (!Number.isFinite(importe)) return 0
  if (moneda === "USD") return redondear(importe)
  return tc > 0 ? redondear(importe / tc) : 0
}

/**
 * El contravalor: dado un importe en una moneda, cuánto es en la otra. Es lo que
 * se muestra en gris abajo de cada campo de importe mientras se tipea, para que
 * nadie tenga que abrir la calculadora.
 */
export function contravalor(importe: number, moneda: Moneda, tc: number): number {
  return moneda === "ARS" ? aDolares(importe, "ARS", tc) : aPesos(importe, "USD", tc)
}

/* ── Formato ──────────────────────────────────────────────────────────────── */

/**
 * `$ 1.234.567,89` · `USD 4.685,07`. Separador de miles con punto y decimales
 * con coma, que es como se leen los importes en Argentina, y el símbolo separado
 * del número para que las columnas de una tabla alineen por la cifra.
 */
export function formatearImporte(
  valor: number | null | undefined,
  moneda: Moneda = "ARS",
  opciones: { decimales?: number; signo?: boolean; simbolo?: boolean } = {}
): string {
  const { decimales = 2, signo = false, simbolo = true } = opciones
  const n = Number.isFinite(valor) ? (valor as number) : 0

  const cifra = Math.abs(n).toLocaleString("es-AR", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  })

  const negativo = n < 0 ? "-" : signo && n > 0 ? "+" : ""
  return simbolo ? `${negativo}${SIMBOLO_MONEDA[moneda]} ${cifra}` : `${negativo}${cifra}`
}

/**
 * Importes grandes en tarjetas de métrica: `$ 63,5 M` en vez de `$ 63.452.799,40`.
 * En un KPI la magnitud importa y los centavos no; en una tabla es al revés y
 * ahí va `formatearImporte`.
 */
export function formatearCompacto(
  valor: number | null | undefined,
  moneda: Moneda = "ARS"
): string {
  const n = Number.isFinite(valor) ? (valor as number) : 0
  const abs = Math.abs(n)
  const signo = n < 0 ? "-" : ""
  const s = SIMBOLO_MONEDA[moneda]

  const corto = (v: number, sufijo: string) =>
    `${signo}${s} ${v.toLocaleString("es-AR", { maximumFractionDigits: 1 })} ${sufijo}`

  if (abs >= 1_000_000_000) return corto(abs / 1_000_000_000, "MM")
  if (abs >= 1_000_000) return corto(abs / 1_000_000, "M")
  if (abs >= 10_000) return corto(abs / 1_000, "K")
  return formatearImporte(n, moneda)
}

/**
 * El TC, con 2 decimales: `1.435,00`. Un guion cuando no hay.
 *
 * El nulo es un caso real y significa "no se conoce la cotización de ese día",
 * no "cero". Devolver `0,00` dibujaba un dato que nadie cargó — la versión
 * anterior de esta función lo hacía, y de ahí salía media pantalla de números
 * inventados.
 */
export function formatearTc(tc: number | null | undefined): string {
  if (tc === null || tc === undefined || !Number.isFinite(tc)) return "—"
  return (tc as number).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/**
 * El importe visto en la otra moneda, o un guion si no se puede saber.
 *
 * `formatearImporte` trata el nulo como cero porque en una columna de importes
 * eso es lo correcto —una factura sin percepciones tiene percepción cero—. Para
 * un contravalor no: un comprobante en pesos sin TC cargado no vale USD 0, vale
 * un importe que no conocemos. Es la diferencia que pedía el punto 2.
 */
export function formatearContravalor(
  valor: number | null | undefined,
  moneda: Moneda
): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return "—"
  return formatearImporte(valor, moneda)
}

/**
 * Lo que escribe una persona → número. Acepta `1.234,56` (formato argentino),
 * `1234.56` (lo que sale de copiar de un Excel en inglés) y `1234,56`.
 *
 * La ambigüedad real es `1.234`: ¿mil doscientos treinta y cuatro, o uno coma
 * doscientos treinta y cuatro? Se resuelve por el lado argentino —con punto de
 * miles— porque es lo que se tipea acá; quien quiera decimales usa la coma.
 */
export function parsearImporte(raw: string | number | null | undefined): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null
  if (!raw) return null

  const limpio = raw.replace(/[^\d.,-]/g, "").trim()
  if (!limpio) return null

  const tieneComa = limpio.includes(",")
  const tienePunto = limpio.includes(".")

  let normalizado: string
  if (tieneComa) {
    // Con coma presente, la coma es el decimal y el punto es separador de miles.
    normalizado = limpio.replace(/\./g, "").replace(",", ".")
  } else if (tienePunto) {
    // Solo punto: es decimal si deja 1 o 2 cifras atrás (1234.5 / 1234.56),
    // y separador de miles si deja 3 (1.234) o si hay más de uno (1.234.567).
    const partes = limpio.split(".")
    const ultima = partes[partes.length - 1]
    normalizado =
      partes.length === 2 && ultima.length <= 2 ? limpio : limpio.replace(/\./g, "")
  } else {
    normalizado = limpio
  }

  const n = Number(normalizado)
  return Number.isFinite(n) ? n : null
}
