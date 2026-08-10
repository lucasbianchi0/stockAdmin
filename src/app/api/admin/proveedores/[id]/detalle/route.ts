import { exigirModulo } from "@/lib/guard-api"
import { ruta } from "@/lib/admin/ruta"
import { detalleEntidad } from "@/lib/admin/detalle-server"

type Ctx = { params: Promise<{ id: string }> }

export const GET = ruta("proveedor detalle", async (_req: Request, ctx: Ctx) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso
  const { id } = await ctx.params
  return detalleEntidad("proveedor", id)
})
