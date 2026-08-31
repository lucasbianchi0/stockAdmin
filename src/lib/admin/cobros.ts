import type { Moneda } from "@/lib/admin/moneda"
import { redondear } from "@/lib/admin/moneda"

/**
 * Cobros de clientes: vocabulario y aritmética.
 *
 * La ecuación que gobierna un recibo, y que la UI muestra en vivo:
 *
 *     lo que cancela  =  lo que entró a la caja  +  las retenciones
 *
 * Las retenciones no son plata que se mueve: son parte de lo que salda la
 * factura y que en vez de entrar al banco se va como crédito fiscal. Olvidarlas
 * es el error clásico — se imputa por el total de la factura, entra menos plata
 * de la que dice el recibo, y la caja queda descuadrada sin que nadie sepa por
 * qué.
 */

export const RETENCIONES = ["ganancias", "iva", "iibb", "suss"] as const
export type Retencion = (typeof RETENCIONES)[number]

export const RETENCION_LABEL: Record<Retencion, string> = {
  ganancias: "Ganancias",
  iva: "IVA",
  iibb: "IIBB",
  suss: "SUSS",
}

/**
 * Las jurisdicciones de Ingresos Brutos.
 *
 * Son las siete que tiene el plan de cuentas del contador. El pedido original
 * hablaba solo de CABA y Buenos Aires, pero abrir por dos y dejar las otras
 * cinco afuera obligaría a volver a tocar la base cada vez que aparezca una
 * provincia — y ya están todas en el plan.
 *
 * Solo IIBB es provincial: Ganancias, IVA y SUSS son nacionales.
 */
export const JURISDICCIONES = [
  "caba",
  "bsas",
  "santa_fe",
  "cordoba",
  "mendoza",
  "neuquen",
  "entre_rios",
] as const
export type Jurisdiccion = (typeof JURISDICCIONES)[number]

export const JURISDICCION_LABEL: Record<Jurisdiccion, string> = {
  caba: "CABA",
  bsas: "Buenos Aires",
  santa_fe: "Santa Fe",
  cordoba: "Córdoba",
  mendoza: "Mendoza",
  neuquen: "Neuquén",
  entre_rios: "Entre Ríos",
}

export function esJurisdiccion(v: unknown): v is Jurisdiccion {
  return typeof v === "string" && (JURISDICCIONES as readonly string[]).includes(v)
}

/** Un renglón de retención. Antes eran cuatro columnas fijas en el recibo; son
 *  filas para que IIBB pueda abrirse por provincia y cada una lleve su cuenta
 *  contable y su certificado. */
export type RetencionDetalle = {
  id?: string
  tipo: Retencion
  /** Solo en IIBB. `null` en una retención vieja migrada, que no tiene cómo
   *  saber de qué provincia era. */
  jurisdiccion: Jurisdiccion | null
  importe: number
  cuentaContableId?: string | null
  cuentaContableNombre?: string | null
  base?: number | null
  alicuota?: number | null
  numeroCertificado?: string | null
}

/** Cómo se nombra un renglón en pantalla: "IIBB · CABA" o simplemente "IVA". */
export function etiquetaRetencion(r: {
  tipo: Retencion
  jurisdiccion: Jurisdiccion | null
}): string {
  const base = RETENCION_LABEL[r.tipo]
  return r.jurisdiccion ? `${base} · ${JURISDICCION_LABEL[r.jurisdiccion]}` : base
}

/** Medio por el que entró la plata: una cuenta y un importe. Un cobro puede
 *  tener varios (mitad transferencia, mitad cheque). */
export type MedioCobro = {
  cuentaId: string
  importe: number
  referencia: string | null
}

export type ImputacionCobro = {
  comprobanteId: string
  importe: number
}

export type CuentaFinanciera = {
  id: string
  nombre: string
  tipo: "caja" | "banco" | "billetera"
  moneda: Moneda
  saldo?: number
  banco?: string | null
  numeroCuenta?: string | null
  alias?: string | null
  /** Solo con `?detalle=1`: lo que necesita la tarjeta de Caja y Bancos para
   *  decir algo más que el saldo. */
  entradasMes?: number
  salidasMes?: number
  sinConciliar?: number
  /** Solo con `?todas=1`: las dadas de baja también vienen, para poder
   *  reactivarlas. En el resto de las pantallas todas las que llegan son activas. */
  activo?: boolean
}

/**
 * La cuenta entera, como la edita su formulario.
 *
 * Es un tipo aparte y no campos opcionales sobre `CuentaFinanciera` porque son
 * dos cosas distintas: `CuentaFinanciera` es lo que un selector necesita para
 * ofrecer "Galicia (ARS)", y esto es la ficha. Mezclarlas obligaría a cada
 * selector a cargar con quince campos que no mira.
 */
export type CuentaFinancieraDetalle = {
  id: string
  nombre: string
  tipo: "caja" | "banco" | "billetera"
  moneda: Moneda
  banco: string | null
  numeroCuenta: string | null
  cbu: string | null
  alias: string | null
  /** Contra qué cuenta del plan se asientan sus movimientos. Sin esto, ningún
   *  movimiento de la cuenta llega al libro diario. */
  cuentaContableId: string | null
  cuentaContableNombre: string | null
  /** Lo que había el día que arrancó el sistema. Es el "saldo anterior" del
   *  extracto y el punto de partida de todos los saldos de la cuenta. */
  saldoInicial: number
  fechaSaldoInicial: string | null
  activo: boolean
  orden: number
  /** Si ya tiene movimientos cargados. Lo decide qué se puede seguir cambiando:
   *  la moneda, no. */
  tieneMovimientos: boolean
}

/** Una factura pendiente, como la ve el panel de imputación. */
export type Pendiente = {
  id: string
  clase: string
  puntoVenta: number | null
  numero: number | null
  fecha: string
  fechaVencimiento: string | null
  moneda: Moneda
  /** El TC del comprobante. `null` si no tiene cotización cargada. */
  tc: number | null
  total: number
  imputado: number
  saldo: number
  detalle: string | null
  signo: 1 | -1
}

export type Cobro = {
  id: string
  fecha: string
  clienteId: string
  clienteNombre: string | null
  moneda: Moneda
  /** El TC del recibo. Solo hace falta cuando cancela comprobantes en otra
   *  moneda; `null` cuando no hubo conversión de por medio. */
  tc: number | null
  retenciones: RetencionDetalle[]
  totalRetenciones: number
  /** Suma de los medios de pago: lo que entró de verdad. */
  totalMedios: number
  /** Suma de las imputaciones, en la moneda del recibo. */
  totalImputado: number
  observaciones: string | null
  createdAt: string
  medios: {
    id: string
    cuentaId: string
    cuentaNombre: string | null
    importe: number
    moneda: Moneda
    referencia: string | null
  }[]
  imputaciones: {
    id: string
    comprobanteId: string
    clase: string
    puntoVenta: number | null
    numero: number | null
    moneda: Moneda
    importe: number
  }[]
}

/* ── Aritmética ───────────────────────────────────────────────────────────── */

export function sumaRetenciones(filas: { importe: number }[]): number {
  return redondear(filas.reduce((a, r) => a + (Number(r.importe) || 0), 0))
}

/**
 * Convierte un importe de la moneda del comprobante a la del recibo (o al
 * revés). El TC es siempre pesos por dólar, igual que en todo el módulo.
 */
export function convertir(
  importe: number,
  desde: Moneda,
  hacia: Moneda,
  tc: number
): number {
  if (desde === hacia) return redondear(importe)
  if (tc <= 0) return 0
  return desde === "USD" ? redondear(importe * tc) : redondear(importe / tc)
}

export type BalanceCobro = {
  /** Lo que cancela, en la moneda del recibo. */
  imputado: number
  /** Lo que entró a las cuentas. */
  medios: number
  retenciones: number
  /** medios + retenciones − imputado. Cero es lo que buscamos. */
  diferencia: number
  cuadra: boolean
}

/**
 * El control del recibo. Se tolera un centavo de diferencia: con importes en dos
 * monedas y conversiones de por medio, exigir cero exacto haría que un recibo
 * legítimo no se pueda guardar por un redondeo.
 */
export function balancear(
  imputadoEnMonedaRecibo: number,
  medios: number,
  retenciones: number
): BalanceCobro {
  const diferencia = redondear(medios + retenciones - imputadoEnMonedaRecibo)
  return {
    imputado: redondear(imputadoEnMonedaRecibo),
    medios: redondear(medios),
    retenciones: redondear(retenciones),
    diferencia,
    cuadra: Math.abs(diferencia) <= 0.01,
  }
}
