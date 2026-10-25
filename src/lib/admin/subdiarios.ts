/**
 * Subdiarios de IVA: el libro de IVA Ventas y el de IVA Compras.
 *
 * Todo sale de la carga de facturas; no hay nada que se cargue acá. Las reglas,
 * las que pidió el contador el 14 y el 15/10/2026:
 *
 *  · **En pesos.** Un comprobante en dólares entra al tipo de cambio de la
 *    propia factura.
 *  · **Las notas de crédito restan.** En la base se guardan en positivo con un
 *    signo aparte; acá ya vienen multiplicadas por él.
 *  · **Mensual** por costumbre, pero el período es libre.
 *
 * Y las del 25/10, cuando mandó el libro como lo arma su sistema: las columnas
 * son las del libro, no una por alícuota. El desglose por alícuota sigue en el
 * panel de totales, que es donde sirve para la declaración jurada.
 */

import type { TipoComprobante } from "@/lib/admin/comprobantes"
import { formatearImporte, redondear } from "@/lib/admin/moneda"
import type { FormaJuridica } from "@/lib/admin/entidades"

/** Las tres alícuotas con columna propia. La de 0% va como exento. */
export const ALICUOTAS_SUBDIARIO = ["0.21", "0.105", "0.27"] as const
export type AlicuotaSubdiario = (typeof ALICUOTAS_SUBDIARIO)[number]

export const ALICUOTA_SUBDIARIO_LABEL: Record<AlicuotaSubdiario, string> = {
  "0.21": "21%",
  "0.105": "10,5%",
  "0.27": "27%",
}

/**
 * Las columnas de retención del libro de ventas, en su orden. IIBB se abre como
 * en el libro del estudio: Mendoza, Provincia y Capital con columna propia y el
 * resto de las provincias juntas en «RET IIBB».
 */
export const RETENCIONES_SUBDIARIO = [
  "iibbMendoza",
  "iibbOtras",
  "suss",
  "iibbBsas",
  "iibbCaba",
  "iva",
  "ganancias",
] as const
export type RetencionSubdiario = (typeof RETENCIONES_SUBDIARIO)[number]

/** Los importes de un renglón. Todos en pesos y con el signo aplicado. */
export type ImportesSubdiario = {
  neto: Record<AlicuotaSubdiario, number>
  iva: Record<AlicuotaSubdiario, number>
  /** La suma de los netos de todas las alícuotas. En una factura C es cero: va
   *  entera a `monotributo`. */
  gravado: number
  noGravado: number
  exento: number
  /** Lo facturado por un monotributista (clase C): sin IVA discriminado, va a
   *  su propia columna y no a gravado. */
  monotributo: number
  ivaTotal: number
  percepcionIva: number
  percepcionIibbCaba: number
  percepcionIibbBsas: number
  ley25413: number
  percepcionGanancias: number
  impuestosInternos: number
  /**
   * Lo que no tiene columna en el libro: en compras la percepción de IIBB
   * Mendoza, los impuestos internos y los otros impuestos; en ventas el no
   * gravado, las percepciones practicadas y los otros impuestos. Sin esta
   * columna el TOTAL no sería la suma de lo que se ve; la columna se muestra
   * solo cuando algún renglón la usa.
   */
  otros: number
  ret: Record<RetencionSubdiario, number>
  total: number
}

export type FilaSubdiario = ImportesSubdiario & {
  id: string
  /** Una factura, o una retención sufrida en un cobro (solo ventas, informativa). */
  origen: "comprobante" | "retencion"
  /** La fecha que define el período. En una retención, la del cobro. */
  fecha: string
  /** La fecha que dice el comprobante. Distinta de `fecha` sólo si se registró otro día. */
  fechaComprobante: string
  clase: string
  /** `00002-00002708`, como en el resto del sistema. */
  numero: string
  /** Como lo escribe el libro del estudio: `FC A-0001-00000214`. */
  factura: string
  entidadId: string | null
  razonSocial: string
  cuit: string | null
  condicionIva: FormaJuridica | null
  moneda: "ARS" | "USD"
  tc: number | null
}

export type TotalesSubdiario = ImportesSubdiario & { comprobantes: number; notasDeCredito: number }

export type LineaResumen = {
  cuentaId: string
  codigo: string
  nombre: string
  debe: number
  haber: number
}

export type Subdiario = {
  tipo: TipoComprobante
  desde: string
  hasta: string
  /** Facturas y, en ventas, las retenciones sufridas del período, por fecha. */
  filas: FilaSubdiario[]
  /** Los de las facturas: las retenciones no entran. */
  totales: TotalesSubdiario
  /** El asiento resumen del período, armado con los asientos de esos mismos
   *  comprobantes. Es lectura: no se registra. */
  resumen: { lineas: LineaResumen[]; debe: number; haber: number; sinAsiento: number }
}

export const TITULO_SUBDIARIO: Record<TipoComprobante, string> = {
  venta: "Subdiario IVA Ventas",
  compra: "Subdiario IVA Compras",
}

/** El título de la hoja impresa, el del libro. */
export const TITULO_LIBRO: Record<TipoComprobante, string> = {
  venta: "LIBRO IVA VENTAS",
  compra: "LIBRO IVA COMPRAS",
}

export const RUTA_SUBDIARIO: Record<TipoComprobante, string> = {
  venta: "/admin/contabilidad/subdiarios/ventas",
  compra: "/admin/contabilidad/subdiarios/compras",
}

/* ── Las columnas del libro ───────────────────────────────────────────────── */

type ClaveImporte = Exclude<keyof ImportesSubdiario, "neto" | "iva" | "ret" | "total">

export type ColumnaLibro = {
  clave: string
  rotulo: string
  valor: (f: ImportesSubdiario) => number
  /** Solo aparece si algún renglón tiene importe. */
  opcional?: boolean
}

const col = (clave: ClaveImporte, rotulo: string, opcional?: boolean): ColumnaLibro => ({
  clave,
  rotulo,
  valor: (f) => f[clave],
  opcional,
})
const colRet = (clave: RetencionSubdiario, rotulo: string): ColumnaLibro => ({
  clave: `ret.${clave}`,
  rotulo,
  valor: (f) => f.ret[clave],
})

/**
 * Las columnas de importe, en el orden del libro del estudio (el PDF de IVA
 * Compras de septiembre y la captura de IVA Ventas). TOTAL va aparte, siempre
 * última. Las usan la pantalla, la hoja impresa y el Excel, así no pueden
 * desalinearse entre sí.
 */
export const COLUMNAS_LIBRO: Record<TipoComprobante, ColumnaLibro[]> = {
  compra: [
    col("gravado", "GRAVADO"),
    col("noGravado", "NO GRAVADO"),
    col("exento", "EXENTO"),
    col("monotributo", "MONOTRIBUTO"),
    col("ivaTotal", "I.V.A."),
    col("percepcionIva", "PER IVA"),
    col("percepcionIibbCaba", "PER IIBB CAP"),
    col("percepcionIibbBsas", "PER IIBB BA"),
    col("ley25413", "LEY 25413"),
    col("percepcionGanancias", "PER Gcias."),
    col("otros", "OTROS", true),
  ],
  venta: [
    col("gravado", "GRAVADO"),
    col("exento", "EXENTO"),
    col("impuestosInternos", "IMP INTERNOS"),
    col("ivaTotal", "I.V.A."),
    colRet("iibbMendoza", "RET IIBB Men"),
    colRet("iibbOtras", "RET IIBB"),
    colRet("suss", "RET SUSS"),
    colRet("iibbBsas", "RET PBA"),
    colRet("iibbCaba", "RET CABA"),
    colRet("iva", "RET IVA"),
    colRet("ganancias", "RET. GCIAS"),
    col("otros", "OTROS", true),
  ],
}

/** Las columnas que van en este conjunto de renglones: las opcionales, solo si
 *  alguno las usa. */
export function columnasVisibles(tipo: TipoComprobante, filas: ImportesSubdiario[]): ColumnaLibro[] {
  return COLUMNAS_LIBRO[tipo].filter((c) => !c.opcional || filas.some((f) => c.valor(f) !== 0))
}

/* ── Formatos del libro ───────────────────────────────────────────────────── */

/**
 * Clase del sistema → el tipo como lo escribe el libro: `FC A`, `NC C`, `EX A`.
 *
 * En ventas la factura es «FV» y la de crédito MiPyME «CF», con sus notas «CC» y
 * «CD», como en la captura del libro de ventas. En compras el libro solo
 * distingue factura, nota y extracto, así que la MiPyME va como una A más.
 */
export function tipoLibro(clase: string, tipo: TipoComprobante): string {
  const c = clase.toUpperCase()
  if (c === "RE") return "RE"
  const mipyme = /^(FC|NC|ND)EA$/.exec(c)
  if (mipyme) {
    if (tipo === "compra") return `${mipyme[1]} A`
    return { FC: "CF A", NC: "CC A", ND: "CD A" }[mipyme[1] as "FC" | "NC" | "ND"]
  }
  const prefijo = c.slice(0, 2)
  const letra = c.slice(2) || "?"
  return `${tipo === "venta" && prefijo === "FC" ? "FV" : prefijo} ${letra}`
}

/** `FC A-0001-00000214`: punto de venta a cuatro dígitos y número a ocho. */
export function facturaLibro(
  clase: string,
  tipo: TipoComprobante,
  puntoVenta: number | null,
  numero: number | null
): string {
  const t = tipoLibro(clase, tipo)
  if (puntoVenta === null && numero === null) return `${t} s/n`
  return `${t}-${String(puntoVenta ?? 0).padStart(4, "0")}-${String(numero ?? 0).padStart(8, "0")}`
}

/** El importe como en el libro: vacío si es cero y entre paréntesis si resta. */
export function importeLibro(v: number): string {
  if (v === 0) return ""
  const s = formatearImporte(Math.abs(v), "ARS", { simbolo: false })
  return v < 0 ? `(${s})` : s
}

/** `2026-09-01` → `1/09/26`, la fecha de los renglones del libro. */
export function fechaRenglonLibro(iso: string): string {
  const [a, m, d] = iso.split("-")
  return `${Number(d)}/${m}/${a.slice(2)}`
}

/** `2026-09-01` → `1/09/2026`, la del encabezado («Desde: 1/09/2026»). */
export function fechaEncabezadoLibro(iso: string): string {
  const [a, m, d] = iso.split("-")
  return `${Number(d)}/${m}/${a}`
}

/* ── Período ──────────────────────────────────────────────────────────────── */

/** `2026-10` → primer y último día del mes. */
export function rangoDelMes(mes: string): { desde: string; hasta: string } {
  const [a, m] = mes.split("-").map(Number)
  const ultimo = new Date(a, m, 0).getDate()
  const mm = String(m).padStart(2, "0")
  return { desde: `${a}-${mm}-01`, hasta: `${a}-${mm}-${String(ultimo).padStart(2, "0")}` }
}

/** El mes en curso en Buenos Aires, como `2026-10`. */
/** `2026-10`, -1 → `2026-09`. */
export function moverMes(mes: string, delta: number): string {
  const [a, m] = mes.split("-").map(Number)
  const d = new Date(a, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

export function mesActual(): string {
  const hoy = new Date(Date.now() - 3 * 3600_000)
  return hoy.toISOString().slice(0, 7)
}

/* ── Totales ──────────────────────────────────────────────────────────────── */

const ceros = (): Record<AlicuotaSubdiario, number> => ({ "0.21": 0, "0.105": 0, "0.27": 0 })
export const retencionesEnCero = (): Record<RetencionSubdiario, number> => ({
  iibbMendoza: 0,
  iibbOtras: 0,
  suss: 0,
  iibbBsas: 0,
  iibbCaba: 0,
  iva: 0,
  ganancias: 0,
})

/** Un renglón sin importes, para armar desde cero. */
export function importesEnCero(): ImportesSubdiario {
  return {
    neto: ceros(),
    iva: ceros(),
    gravado: 0,
    noGravado: 0,
    exento: 0,
    monotributo: 0,
    ivaTotal: 0,
    percepcionIva: 0,
    percepcionIibbCaba: 0,
    percepcionIibbBsas: 0,
    ley25413: 0,
    percepcionGanancias: 0,
    impuestosInternos: 0,
    otros: 0,
    ret: retencionesEnCero(),
    total: 0,
  }
}

const SIMPLES: ClaveImporte[] = [
  "gravado",
  "noGravado",
  "exento",
  "monotributo",
  "ivaTotal",
  "percepcionIva",
  "percepcionIibbCaba",
  "percepcionIibbBsas",
  "ley25413",
  "percepcionGanancias",
  "impuestosInternos",
  "otros",
]

/**
 * Los totales de un conjunto de renglones. Vive acá y no en la API porque la
 * pantalla filtra por proveedor y por tipo de comprobante, y los totales tienen
 * que ser los de lo que se ve. También arma el subtotal de cada hoja impresa.
 *
 * Suma lo que le pasen: quien llama decide si van las retenciones. El total del
 * libro va sin ellas (ver `soloComprobantes`).
 */
export function totalizar(filas: FilaSubdiario[]): TotalesSubdiario {
  const t: TotalesSubdiario = {
    ...importesEnCero(),
    comprobantes: filas.filter((f) => f.origen === "comprobante").length,
    notasDeCredito: filas.filter((f) => f.origen === "comprobante" && f.clase.startsWith("NC")).length,
  }
  for (const f of filas) {
    for (const k of ALICUOTAS_SUBDIARIO) {
      t.neto[k] = redondear(t.neto[k] + f.neto[k])
      t.iva[k] = redondear(t.iva[k] + f.iva[k])
    }
    for (const k of SIMPLES) t[k] = redondear(t[k] + f[k])
    for (const k of RETENCIONES_SUBDIARIO) t.ret[k] = redondear(t.ret[k] + f.ret[k])
    t.total = redondear(t.total + f.total)
  }
  return t
}

/**
 * Las retenciones del libro de ventas son informativas: se listan para que el
 * contador las vea en el mismo papel, pero no son ventas y no van en el total
 * del período. Cualquier total del libro pasa por acá.
 */
export const soloComprobantes = (filas: FilaSubdiario[]) => filas.filter((f) => f.origen === "comprobante")
export const soloRetenciones = (filas: FilaSubdiario[]) => filas.filter((f) => f.origen === "retencion")

/** La suma del IVA de todas las alícuotas. */
export const ivaTotal = (t: Pick<TotalesSubdiario, "iva">) =>
  redondear(ALICUOTAS_SUBDIARIO.reduce((s, k) => s + t.iva[k], 0))

/** La suma del neto gravado de todas las alícuotas. */
export const netoTotal = (t: Pick<TotalesSubdiario, "neto">) =>
  redondear(ALICUOTAS_SUBDIARIO.reduce((s, k) => s + t.neto[k], 0))
