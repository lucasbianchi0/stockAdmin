import { exigirModulo } from "@/lib/guard-api"
import { ruta } from "@/lib/admin/ruta"
import { borrarComprobante, editarComprobante } from "@/lib/admin/comprobantes-handlers"

type Ctx = { params: Promise<{ id: string }> }

export const PATCH = ruta("compras PATCH", async (req: Request, ctx: Ctx) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso
  const { id } = await ctx.params
  return editarComprobante("compra", req, id)
})

export const DELETE = ruta("compras DELETE", async (_req: Request, ctx: Ctx) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso
  const { id } = await ctx.params
  return borrarComprobante("compra", id)
})
