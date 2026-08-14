import {
  sumaRetenciones,
  type Cobro,
  type Jurisdiccion,
  type Retencion,
  type RetencionDetalle,
} from "@/lib/admin/cobros"
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
  ),
  pago_retenciones (
    id, tipo, jurisdiccion, importe, base, alicuota, numero_certificado,
    contable:plan_cuentas (id, codigo, nombre)
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
  pago_retenciones?: {
    id: string
    tipo: string
    jurisdiccion: string | null
    importe: number | string
    base: number | string | null
    alicuota: number | string | null
    numero_certificado: string | null
    contable?: { id: string; codigo: string; nombre: string } | null
  }[]
}

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v))

export function aCobro(fila: Fila): Cobro {
  // Desde la migración de retenciones son filas y no cuatro columnas: es lo que
  // permite abrir IIBB por provincia y que cada renglón lleve su cuenta contable
  // y su certificado.
  const retenciones: RetencionDetalle[] = (fila.pago_retenciones ?? []).map((r) => ({
    id: r.id,
    tipo: r.tipo as Retencion,
    jurisdiccion: (r.jurisdiccion as Jurisdiccion | null) ?? null,
    importe: num(r.importe),
    cuentaContableId: r.contable?.id ?? null,
    cuentaContableNombre: r.contable ? `${r.contable.codigo} · ${r.contable.nombre}` : null,
    base: r.base === null || r.base === undefined ? null : Number(r.base),
    alicuota: r.alicuota === null || r.alicuota === undefined ? null : Number(r.alicuota),
    numeroCertificado: r.numero_certificado,
  }))

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
    tc: fila.tc === null || fila.tc === undefined ? null : Number(fila.tc),
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
