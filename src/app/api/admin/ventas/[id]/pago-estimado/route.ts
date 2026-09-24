import { exigirModulo } from "@/lib/guard-api"
import { ruta } from "@/lib/admin/ruta"
import { fecharPagoEstimado } from "@/lib/admin/comprobantes-handlers"

type Ctx = { params: Promise<{ id: string }> }

/** La fecha estimada de pago, editable desde el reporte de pendientes sin abrir
 *  el comprobante. No mueve saldos, así que no pasa por el PATCH completo. */
export const PATCH = ruta("ventas pago estimado PATCH", async (req: Request, ctx: Ctx) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso
  const { id } = await ctx.params
  return fecharPagoEstimado("venta", req, id)
})
