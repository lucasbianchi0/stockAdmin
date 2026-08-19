import type { Moneda } from "@/lib/admin/moneda"

/**
 * Clases de comprobante, alícuotas y vencimientos.
 *
 * Las clases están acá y no en una tabla de la base por una razón práctica: son
 * una lista que fija la normativa, cambia cada varios años y la usa el
 * formulario para armar los selectores. En una tabla habría que mantener un ABM
 * que nadie va a usar; acá se agrega una línea y se despliega.
 */

/* ── Clases ───────────────────────────────────────────────────────────────── */

export type TipoComprobante = "venta" | "compra"

export type Clase = {
  codigo: string
  nombre: string
  /** -1 en las notas de crédito: restan de la deuda. Espeja `comprobante_signo`
   *  de la base, que es la que manda. */
  signo: 1 | -1
  /** Las notas no generan deuda nueva, ajustan una anterior. Sirve para agrupar
   *  y para no pedir vencimiento donde no tiene sentido. */
  esNota: boolean
}

const clase = (codigo: string, nombre: string): Clase => ({
  codigo,
  nombre,
  signo: codigo.startsWith("NC") ? -1 : 1,
  esNota: codigo.startsWith("NC") || codigo.startsWith("ND"),
})

/** Las que emite Accedra. Salen del pliego de administración. */
export const CLASES_VENTA: Clase[] = [
  clase("FCA", "Factura A"),
  clase("FCB", "Factura B"),
  clase("FCEA", "Factura E (exportación)"),
  clase("NCA", "Nota de crédito A"),
  clase("NCB", "Nota de crédito B"),
  clase("NCEA", "Nota de crédito E"),
  clase("NDA", "Nota de débito A"),
  clase("NDB", "Nota de débito B"),
  clase("NDEA", "Nota de débito E"),
]

/**
 * Las que recibe de proveedores.
 *
 * Están las B y las C además de las A, aunque no den crédito fiscal: el
 * proveedor monotributista factura C y el chico que no discrimina IVA factura B,
 * y las dos son gastos reales que hay que registrar. Sin ellas en la lista, la
 * carga de una factura C terminaba en «el tipo FCC no es un comprobante de
 * compra» y la única salida era anotarla como A, que inventa un IVA crédito que
 * nadie puede computar.
 */
export const CLASES_COMPRA: Clase[] = [
  clase("FCA", "Factura A"),
  clase("FCB", "Factura B"),
  clase("FCC", "Factura C"),
  clase("NCA", "Nota de crédito A"),
  clase("NCB", "Nota de crédito B"),
  clase("NCC", "Nota de crédito C"),
  clase("NDA", "Nota de débito A"),
  clase("NDB", "Nota de débito B"),
  clase("NDC", "Nota de débito C"),
]

export function clasesDe(tipo: TipoComprobante): Clase[] {
  return tipo === "venta" ? CLASES_VENTA : CLASES_COMPRA
}

/** Todos los códigos que el sistema entiende, de los dos circuitos. Lo usa la
 *  extracción: el modelo lee el papel sin saber de qué lado del mostrador está,
 *  y recién después se valida que la clase corresponda al tipo. */
export const CODIGOS_CLASE: string[] = [
  ...new Set([...CLASES_VENTA, ...CLASES_COMPRA].map((c) => c.codigo)),
]

export function buscarClase(tipo: TipoComprobante, codigo: string): Clase | undefined {
  return clasesDe(tipo).find((c) => c.codigo === codigo.toUpperCase())
}

export function esClaseValida(tipo: TipoComprobante, codigo: unknown): boolean {
  return typeof codigo === "string" && buscarClase(tipo, codigo) !== undefined
}

/* ── IVA ──────────────────────────────────────────────────────────────────── */

/** Como fracción, que es como se guarda. El pliego usa 10,5 · 21 · 27 en
 *  compras y 10,5 · 21 en ventas; se ofrecen todas y el 0 para lo no gravado. */
export const ALICUOTAS = [0, 0.105, 0.21, 0.27] as const

export const ALICUOTA_LABEL: Record<string, string> = {
  "0": "0 %",
  "0.105": "10,5 %",
  "0.21": "21 %",
  "0.27": "27 %",
}

/* ── Numeración ───────────────────────────────────────────────────────────── */

/** `00002-00002708`, como sale de AFIP. */
export function formatearNumero(
  puntoVenta: number | null,
  numero: number | null
): string {
  if (puntoVenta === null && numero === null) return "—"
  const pv = String(puntoVenta ?? 0).padStart(5, "0")
  const nro = String(numero ?? 0).padStart(8, "0")
  return `${pv}-${nro}`
}

/**
 * Lo que se pega de una factura → punto de venta y número. Acepta
 * `00002-00002708`, `2-2708`, `0000200002708` y `2708` suelto.
 *
 * Existe porque nadie tipea los dos campos por separado: se copia el número
 * entero del PDF de AFIP y se pega. Sin esto, la mitad de las cargas quedan con
 * el punto de venta metido adentro del número.
 */
export function parsearNumero(raw: string): { puntoVenta: number | null; numero: number | null } {
  const limpio = raw.trim()
  if (!limpio) return { puntoVenta: null, numero: null }

  const conGuion = limpio.match(/^(\d{1,5})\s*[-–/]\s*(\d{1,8})$/)
  if (conGuion) {
    return { puntoVenta: Number(conGuion[1]), numero: Number(conGuion[2]) }
  }

  const digitos = limpio.replace(/\D/g, "")
  if (!digitos) return { puntoVenta: null, numero: null }

  // 13 dígitos es el formato pegado de AFIP: 5 de punto de venta + 8 de número.
  if (digitos.length === 13) {
    return { puntoVenta: Number(digitos.slice(0, 5)), numero: Number(digitos.slice(5)) }
  }

  return { puntoVenta: null, numero: Number(digitos) }
}

/* ── Vencimientos ─────────────────────────────────────────────────────────── */

export type EstadoVencimiento = "vencido" | "hoy" | "proximo" | "en_plazo" | "lejano" | "sin_fecha"

export const VENCIMIENTO_LABEL: Record<EstadoVencimiento, string> = {
  vencido: "Vencida",
  hoy: "Vence hoy",
  proximo: "Por vencer",
  en_plazo: "En plazo",
  lejano: "En plazo",
  sin_fecha: "Sin vencimiento",
}

/**
 * Días entre hoy y la fecha, en días de calendario y no de reloj: una factura
 * que vence mañana a la mañana tiene que decir "1 día", no "0" porque faltan 14
 * horas. Por eso se comparan fechas a medianoche y no timestamps.
 */
export function diasPara(fechaISO: string | null): number | null {
  if (!fechaISO) return null
  const [a, m, d] = fechaISO.split("-").map(Number)
  if (!a || !m || !d) return null

  const objetivo = new Date(a, m - 1, d)
  const hoy = new Date()
  const hoyLimpio = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())

  return Math.round((objetivo.getTime() - hoyLimpio.getTime()) / 86_400_000)
}

/**
 * El semáforo. Los cortes son 0 / 1 / 7 / 30 días: vencido, inmediato, la semana
 * que viene, el mes. Están acá y no en cada tabla para que "por vencer" quiera
 * decir lo mismo en pendientes de cobro, en pendientes de pago y en el panel.
 */
export function estadoVencimiento(fechaISO: string | null): EstadoVencimiento {
  const dias = diasPara(fechaISO)
  if (dias === null) return "sin_fecha"
  if (dias < 0) return "vencido"
  if (dias <= 1) return "hoy"
  if (dias <= 7) return "proximo"
  if (dias <= 30) return "en_plazo"
  return "lejano"
}

/** "Vencida hace 12 días" · "Vence en 5 días" · "Vence hoy". */
export function textoVencimiento(fechaISO: string | null): string {
  const dias = diasPara(fechaISO)
  if (dias === null) return "Sin vencimiento"
  if (dias < 0) {
    const n = Math.abs(dias)
    return `Vencida hace ${n} ${n === 1 ? "día" : "días"}`
  }
  if (dias === 0) return "Vence hoy"
  if (dias === 1) return "Vence mañana"
  return `Vence en ${dias} días`
}

/* ── Cálculo del total ────────────────────────────────────────────────────── */

export type ImportesComprobante = {
  netoGravado: number
  alicuotaIva: number
  iva: number
  noGravado: number
  exento: number
  percepcionIva: number
  percepcionIibb: number
  otrosImpuestos: number
}

/**
 * El total es la suma de las partes, siempre. No se deja escribir a mano: si el
 * total no coincide con los componentes, el IVA del libro no cierra con el IVA
 * de la factura y eso aparece recién en la declaración jurada, dos meses tarde.
 */
export function totalDe(i: ImportesComprobante): number {
  const suma =
    i.netoGravado +
    i.iva +
    i.noGravado +
    i.exento +
    i.percepcionIva +
    i.percepcionIibb +
    i.otrosImpuestos
  return Math.round(suma * 100) / 100
}

/** El IVA que corresponde al neto según la alícuota elegida. */
export function ivaDe(netoGravado: number, alicuota: number): number {
  return Math.round(netoGravado * alicuota * 100) / 100
}

/* ── La forma que viaja a la UI ───────────────────────────────────────────── */

export type Comprobante = {
  id: string
  tipo: TipoComprobante
  clienteId: string | null
  clienteNombre: string | null
  proveedorId: string | null
  proveedorNombre: string | null
  clase: string
  fecha: string
  fechaVencimiento: string | null
  fechaEstimadaPago: string | null
  puntoVenta: number | null
  numero: number | null
  cuentaContableId: string | null
  cuentaContableNombre: string | null
  detalle: string | null
  /**
   * En qué punto de su vida está.
   *
   *   borrador    se está cargando · no suma a ningún saldo · sin asiento
   *   confirmado  es un dato: entra en saldos, IVA y mayor
   *   anulado     dejó de valer, pero conserva su número
   */
  estado: EstadoComprobante
  /** Cuándo se confirmó, que no es lo mismo que cuándo se cargó. */
  confirmadoAt: string | null
  moneda: Moneda
  /**
   * Pesos por dólar de ESTE comprobante. Obligatorio en dólares (el TC al que se
   * cerró la operación) y opcional en pesos (el dólar de referencia del día).
   *
   * `null` significa que no se conoce — y entonces `totalUsd` tampoco. Antes se
   * guardaba 1 en los comprobantes en pesos, que hacía que el importe en dólares
   * diera igual que el importe en pesos: es el punto 2 del pedido.
   */
  tc: number | null
  netoGravado: number
  alicuotaIva: number | null
  iva: number
  noGravado: number
  exento: number
  percepcionIva: number
  percepcionIibb: number
  otrosImpuestos: number
  total: number
  totalArs: number
  /** `null` cuando no hay TC cargado: no se sabe, y un guion es la respuesta
   *  correcta. */
  totalUsd: number | null
  signo: 1 | -1
  condicionPago: string | null
  vendedorId: string | null
  vendedorNombre: string | null
  observaciones: string | null
  createdAt: string
  /** Cuánto se cobró/pagó de este comprobante. Se calcula sumando las
   *  imputaciones — nunca se guarda, porque un estado denormalizado se
   *  desincroniza el día que alguien anula un recibo. */
  imputado: number
  saldo: number
}

/* ── Estado del comprobante ───────────────────────────────────────────────── */

export const ESTADOS_COMPROBANTE = ["borrador", "confirmado", "anulado"] as const
export type EstadoComprobante = (typeof ESTADOS_COMPROBANTE)[number]

export const ESTADO_LABEL: Record<EstadoComprobante, string> = {
  borrador: "Borrador",
  confirmado: "Confirmado",
  anulado: "Anulado",
}

/** El tono del badge de cada estado, para que sea el mismo en las seis
 *  pantallas que lo muestran. */
export const ESTADO_TONO: Record<EstadoComprobante, "warning" | "success" | "neutral"> = {
  borrador: "warning",
  confirmado: "success",
  anulado: "neutral",
}

/** Un borrador se edita entero. Un confirmado, solo mientras nadie lo haya
 *  imputado — y eso lo decide el servidor, que es quien ve las imputaciones. */
export function esEditableSinRestriccion(estado: EstadoComprobante): boolean {
  return estado === "borrador"
}

/* ── Estado de cobranza ───────────────────────────────────────────────────── */

export type EstadoSaldo = "pendiente" | "parcial" | "saldado"

export function estadoDeSaldo(total: number, saldo: number): EstadoSaldo {
  // Un centavo de tolerancia: con conversiones de moneda de por medio, exigir
  // cero exacto dejaría facturas "casi pagadas" para siempre.
  if (saldo <= 0.01) return "saldado"
  if (saldo < total - 0.01) return "parcial"
  return "pendiente"
}

/** "Cobrada" en ventas, "Pagada" en compras: es el mismo estado visto desde los
 *  dos lados del mostrador, y llamarlo igual en los dos confunde. */
export function etiquetaSaldo(estado: EstadoSaldo, tipo: TipoComprobante): string {
  if (estado === "saldado") return tipo === "compra" ? "Pagada" : "Cobrada"
  return estado === "parcial" ? "Parcial" : "Pendiente"
}
