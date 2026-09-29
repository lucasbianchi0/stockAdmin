import { exigirModulo } from "@/lib/guard-api"
import { ruta } from "@/lib/admin/ruta"
import { duplicarPresupuesto } from "@/lib/comercial/presupuestos-server"

type Ctx = { params: Promise<{ id: string }> }

/** Una copia en borrador con la planilla entera, sin el legajo del original. */
export const POST = ruta("presupuesto duplicar", async (_req: Request, ctx: Ctx) => {
  const sinPermiso = await exigirModulo("comercial")
  if (sinPermiso) return sinPermiso
  const { id } = await ctx.params
  return duplicarPresupuesto(id)
})
