import { exigirModulo } from "@/lib/guard-api"
import { ruta } from "@/lib/admin/ruta"
import { cambiarEstadoComprobante } from "@/lib/admin/comprobantes-handlers"

type Ctx = { params: Promise<{ id: string }> }

/** Confirmar un borrador, devolverlo a borrador o anularlo. Todo lo caro —el
 *  asiento— lo dispara la base al ver el cambio de estado. */
export const PATCH = ruta("ventas estado PATCH", async (req: Request, ctx: Ctx) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso
  const { id } = await ctx.params
  return cambiarEstadoComprobante("venta", req, id)
})
