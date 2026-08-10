import { RETENCIONES, sumaRetenciones, type Cobro, type Retencion } from "@/lib/admin/cobros"
import type { Moneda } from "@/lib/admin/moneda"

/**
 * Mapeo de un recibo entre la base y la UI.
 *
 * Vive fuera del `route.ts` por lo mismo que `entidades-server.ts`: Next solo
 * acepta handlers HTTP como exports de una ruta, y esto lo usan tanto el listado
 * como el detalle.
 */

/** Las dos puntas del mismo movimiento: cobramos a un cliente, pagamos a un
 *  proveedor. Comparten tabla, forma y aritmética. */
export type TipoPago = "cobro" | "pago"

export const SELECT_COBRO = `
  *,
  cliente:clientes (id, razon_social),
  proveedor:proveedores (id, razon_social),
  movimientos (id, cuenta_id, importe, moneda, referencia, cuenta:cuentas_financieras (id, nombre)),
  imputaciones (
    id, importe, comprobante_id,
    comprobante:comprobantes (id, clase, punto_venta, numero, moneda)
  )
`

type Fila = Record<string, unknown> & {
  cliente?: { id: string; razon_social: string } | null
  proveedor?: { id: string; razon_social: string } | null
  movimientos?: {
    id: string
    cuenta_id: string
    importe: number | string
    moneda: string
    referencia: string | null
    cuenta?: { id: string; nombre: string } | null
  }[]
  imputaciones?: {
    id: string
    importe: number | string
    comprobante_id: string
    comprobante?: {
      id: string
      clase: string
      punto_venta: number | null
      numero: number | null
      moneda: string
    } | null
  }[]
}

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v))

export function aCobro(fila: Fila): Cobro {
  const retenciones = Object.fromEntries(
    RETENCIONES.map((k) => [k, num(fila[`ret_${k}`])])
  ) as Record<Retencion, number>

  const medios = (fila.movimientos ?? []).map((m) => ({
    id: m.id,
    cuentaId: m.cuenta_id,
    cuentaNombre: m.cuenta?.nombre ?? null,
    importe: num(m.importe),
    moneda: m.moneda as Moneda,
    referencia: m.referencia,
  }))

  const imputaciones = (fila.imputaciones ?? []).map((i) => ({
    id: i.id,
    comprobanteId: i.comprobante_id,
    clase: i.comprobante?.clase ?? "",
    puntoVenta: i.comprobante?.punto_venta ?? null,
    numero: i.comprobante?.numero ?? null,
    moneda: (i.comprobante?.moneda ?? "ARS") as Moneda,
    importe: num(i.importe),
  }))

  return {
    id: fila.id as string,
    fecha: fila.fecha as string,
    clienteId: ((fila.cliente_id ?? fila.proveedor_id) as string) ?? "",
    clienteNombre: fila.cliente?.razon_social ?? fila.proveedor?.razon_social ?? null,
    moneda: fila.moneda as Moneda,
    tc: num(fila.tc),
    retenciones,
    totalRetenciones: sumaRetenciones(retenciones),
    totalMedios: medios.reduce((a, m) => a + m.importe, 0),
    totalImputado: imputaciones.reduce((a, i) => a + i.importe, 0),
    observaciones: (fila.observaciones as string | null) ?? null,
    createdAt: fila.created_at as string,
    medios,
    imputaciones,
  }
}
