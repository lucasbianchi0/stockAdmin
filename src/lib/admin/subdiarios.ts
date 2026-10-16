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
 *  · **Una columna por alícuota**, neto e IVA, y los totales de cada una al pie.
 *  · **Mensual** por costumbre, pero el período es libre.
 */

import type { TipoComprobante } from "@/lib/admin/comprobantes"
import { redondear } from "@/lib/admin/moneda"
import type { FormaJuridica } from "@/lib/admin/entidades"

/** Las tres alícuotas con columna propia. La de 0% va como exento. */
export const ALICUOTAS_SUBDIARIO = ["0.21", "0.105", "0.27"] as const
export type AlicuotaSubdiario = (typeof ALICUOTAS_SUBDIARIO)[number]

export const ALICUOTA_SUBDIARIO_LABEL: Record<AlicuotaSubdiario, string> = {
  "0.21": "21%",
  "0.105": "10,5%",
  "0.27": "27%",
}

export type FilaSubdiario = {
  id: string
  /** La fecha que define el período. */
  fecha: string
  /** La fecha que dice el comprobante. Distinta de `fecha` sólo si se registró otro día. */
  fechaComprobante: string
  clase: string
  numero: string
  entidadId: string | null
  razonSocial: string
  cuit: string | null
  condicionIva: FormaJuridica | null
  moneda: "ARS" | "USD"
  tc: number | null
  /** Todo lo de abajo en pesos y con el signo aplicado. */
  neto: Record<AlicuotaSubdiario, number>
  iva: Record<AlicuotaSubdiario, number>
  noGravado: number
  exento: number
  percepcionIva: number
  percepcionIibb: number
  otrosImpuestos: number
  total: number
}

export type TotalesSubdiario = Omit<
  FilaSubdiario,
  | "id"
  | "fecha"
  | "fechaComprobante"
  | "clase"
  | "numero"
  | "entidadId"
  | "razonSocial"
  | "cuit"
  | "condicionIva"
  | "moneda"
  | "tc"
> & { comprobantes: number; notasDeCredito: number }

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
  filas: FilaSubdiario[]
  totales: TotalesSubdiario
  /** El asiento resumen del período, armado con los asientos de esos mismos
   *  comprobantes. Es lectura: no se registra. */
  resumen: { lineas: LineaResumen[]; debe: number; haber: number; sinAsiento: number }
}

export const TITULO_SUBDIARIO: Record<TipoComprobante, string> = {
  venta: "Subdiario IVA Ventas",
  compra: "Subdiario IVA Compras",
}

export const RUTA_SUBDIARIO: Record<TipoComprobante, string> = {
  venta: "/admin/contabilidad/subdiarios/ventas",
  compra: "/admin/contabilidad/subdiarios/compras",
}

/** `2026-10` → primer y último día del mes. */
export function rangoDelMes(mes: string): { desde: string; hasta: string } {
  const [a, m] = mes.split("-").map(Number)
  const ultimo = new Date(a, m, 0).getDate()
  const mm = String(m).padStart(2, "0")
  return { desde: `${a}-${mm}-01`, hasta: `${a}-${mm}-${String(ultimo).padStart(2, "0")}` }
}

/** El mes en curso en Buenos Aires, como `2026-10`. */
export function mesActual(): string {
  const hoy = new Date(Date.now() - 3 * 3600_000)
  return hoy.toISOString().slice(0, 7)
}

const ceros = (): Record<AlicuotaSubdiario, number> => ({ "0.21": 0, "0.105": 0, "0.27": 0 })

/**
 * Los totales de un conjunto de renglones. Vive acá y no en la API porque la
 * pantalla filtra por proveedor y por tipo de comprobante, y los totales tienen
 * que ser los de lo que se ve.
 */
export function totalizar(filas: FilaSubdiario[]): TotalesSubdiario {
  const t: TotalesSubdiario = {
    comprobantes: filas.length,
    notasDeCredito: filas.filter((f) => f.clase.startsWith("NC")).length,
    neto: ceros(),
    iva: ceros(),
    noGravado: 0,
    exento: 0,
    percepcionIva: 0,
    percepcionIibb: 0,
    otrosImpuestos: 0,
    total: 0,
  }
  for (const f of filas) {
    for (const k of ALICUOTAS_SUBDIARIO) {
      t.neto[k] = redondear(t.neto[k] + f.neto[k])
      t.iva[k] = redondear(t.iva[k] + f.iva[k])
    }
    t.noGravado = redondear(t.noGravado + f.noGravado)
    t.exento = redondear(t.exento + f.exento)
    t.percepcionIva = redondear(t.percepcionIva + f.percepcionIva)
    t.percepcionIibb = redondear(t.percepcionIibb + f.percepcionIibb)
    t.otrosImpuestos = redondear(t.otrosImpuestos + f.otrosImpuestos)
    t.total = redondear(t.total + f.total)
  }
  return t
}

/** La suma del IVA de todas las alícuotas. */
export const ivaTotal = (t: Pick<TotalesSubdiario, "iva">) =>
  redondear(ALICUOTAS_SUBDIARIO.reduce((s, k) => s + t.iva[k], 0))

/** La suma del neto gravado de todas las alícuotas. */
export const netoTotal = (t: Pick<TotalesSubdiario, "neto">) =>
  redondear(ALICUOTAS_SUBDIARIO.reduce((s, k) => s + t.neto[k], 0))
