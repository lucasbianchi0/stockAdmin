import { exigirModulo } from "@/lib/guard-api"
import { ruta } from "@/lib/admin/ruta"
import { listarAdjuntos, subirAdjunto } from "@/lib/comercial/adjuntos-server"

type Ctx = { params: Promise<{ id: string }> }

/** El legajo: remitos, OC, facturas de compra y de venta, fotos. */
export const GET = ruta("presupuesto adjuntos GET", async (_req: Request, ctx: Ctx) => {
  const sinPermiso = await exigirModulo("comercial")
  if (sinPermiso) return sinPermiso
  const { id } = await ctx.params
  return listarAdjuntos(id)
})

export const POST = ruta("presupuesto adjuntos POST", async (req: Request, ctx: Ctx) => {
  const sinPermiso = await exigirModulo("comercial")
  if (sinPermiso) return sinPermiso
  const { id } = await ctx.params
  return subirAdjunto(req, id)
})
