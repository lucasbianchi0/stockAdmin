import { exigirModulo } from "@/lib/guard-api"
import { ruta } from "@/lib/admin/ruta"
import {
  borrarPresupuesto,
  guardarPresupuesto,
  leerPresupuesto,
} from "@/lib/comercial/presupuestos-server"

type Ctx = { params: Promise<{ id: string }> }

export const GET = ruta("presupuesto GET", async (_req: Request, ctx: Ctx) => {
  const sinPermiso = await exigirModulo("comercial")
  if (sinPermiso) return sinPermiso
  const { id } = await ctx.params
  return leerPresupuesto(id)
})

/** Guarda cabecera y renglones juntos: lo que se ve es lo que queda. */
export const PATCH = ruta("presupuesto PATCH", async (req: Request, ctx: Ctx) => {
  const sinPermiso = await exigirModulo("comercial")
  if (sinPermiso) return sinPermiso
  const { id } = await ctx.params
  return guardarPresupuesto(req, id)
})

export const DELETE = ruta("presupuesto DELETE", async (_req: Request, ctx: Ctx) => {
  const sinPermiso = await exigirModulo("comercial")
  if (sinPermiso) return sinPermiso
  const { id } = await ctx.params
  return borrarPresupuesto(id)
})
