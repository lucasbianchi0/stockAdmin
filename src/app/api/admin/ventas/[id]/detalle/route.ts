import { exigirModulo } from "@/lib/guard-api"
import { ruta } from "@/lib/admin/ruta"
import { detalleComprobante } from "@/lib/admin/detalle-server"

type Ctx = { params: Promise<{ id: string }> }

export const GET = ruta("venta detalle", async (_req: Request, ctx: Ctx) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso
  const { id } = await ctx.params
  return detalleComprobante("venta", id)
})
