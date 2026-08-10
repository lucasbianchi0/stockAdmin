import { exigirModulo } from "@/lib/guard-api"
import { ruta } from "@/lib/admin/ruta"
import { anularPago, obtenerPago } from "@/lib/admin/pagos-detalle-server"

type Ctx = { params: Promise<{ id: string }> }

export const GET = ruta("cobros GET id", async (_req: Request, ctx: Ctx) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso
  const { id } = await ctx.params
  return obtenerPago("cobro", id)
})

/**
 * Anular. No hay edición: cambiar un recibo ya imputado significa recalcular
 * saldos de varios comprobantes y mover plata entre cuentas, y hacerlo por
 * partes deja el momento en que el comprobante ya está descancelado pero la
 * plata todavía figura en el banco. El cascade se lleva imputaciones y
 * movimientos, así que los saldos se recalculan solos.
 */
export const DELETE = ruta("cobros DELETE", async (_req: Request, ctx: Ctx) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso
  const { id } = await ctx.params
  return anularPago("cobro", id)
})
