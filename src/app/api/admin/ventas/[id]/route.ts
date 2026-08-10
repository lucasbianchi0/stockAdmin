import { exigirModulo } from "@/lib/guard-api"
import { ruta } from "@/lib/admin/ruta"
import { borrarComprobante, editarComprobante } from "@/lib/admin/comprobantes-handlers"

type Ctx = { params: Promise<{ id: string }> }

export const PATCH = ruta("ventas PATCH", async (req: Request, ctx: Ctx) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso
  const { id } = await ctx.params
  return editarComprobante("venta", req, id)
})

export const DELETE = ruta("ventas DELETE", async (_req: Request, ctx: Ctx) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso
  const { id } = await ctx.params
  return borrarComprobante("venta", id)
})
