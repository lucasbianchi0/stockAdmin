import type { Moneda } from "@/lib/admin/moneda"
import type {
  CategoriaGasto,
  Movimiento,
  OrigenMovimiento,
} from "@/lib/admin/movimientos"

export const SELECT_MOVIMIENTO = `
  *,
  cuenta:cuentas_financieras (id, nombre),
  contable:plan_cuentas (id, codigo, nombre)
`

type Fila = Record<string, unknown> & {
  cuenta?: { id: string; nombre: string } | null
  contable?: { id: string; codigo: string; nombre: string } | null
}

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v))

export function aMovimiento(fila: Fila): Movimiento {
  return {
    id: fila.id as string,
    cuentaId: fila.cuenta_id as string,
    cuentaNombre: fila.cuenta?.nombre ?? null,
    fecha: fila.fecha as string,
    tipo: fila.tipo as "ingreso" | "egreso",
    importe: num(fila.importe),
    moneda: fila.moneda as Moneda,
    tc: num(fila.tc),
    importeArs: num(fila.importe_ars),
    importeUsd: num(fila.importe_usd),
    signo: num(fila.signo) === -1 ? -1 : 1,
    origen: fila.origen as OrigenMovimiento,
    pagoId: (fila.pago_id as string | null) ?? null,
    cuentaContableId: fila.contable?.id ?? null,
    cuentaContableNombre: fila.contable
      ? `${fila.contable.codigo} · ${fila.contable.nombre}`
      : null,
    referencia: (fila.referencia as string | null) ?? null,
    detalle: (fila.detalle as string | null) ?? null,
    categoria: (fila.categoria as CategoriaGasto | null) ?? null,
    conciliado: Boolean(fila.conciliado),
    createdAt: fila.created_at as string,
  }
}
