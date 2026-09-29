import { exigirModulo } from "@/lib/guard-api"
import { ruta } from "@/lib/admin/ruta"
import { borrarAdjunto } from "@/lib/comercial/adjuntos-server"

type Ctx = { params: Promise<{ id: string }> }

export const DELETE = ruta("presupuesto adjunto DELETE", async (_req: Request, ctx: Ctx) => {
  const sinPermiso = await exigirModulo("comercial")
  if (sinPermiso) return sinPermiso
  const { id } = await ctx.params
  return borrarAdjunto(id)
})
