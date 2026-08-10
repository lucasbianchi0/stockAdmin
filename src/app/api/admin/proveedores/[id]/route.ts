import { exigirModulo } from "@/lib/guard-api"
import { ruta } from "@/lib/admin/ruta"
import {
  CONFIG_PROVEEDORES,
  borrarEntidad,
  editarEntidad,
} from "@/lib/admin/entidades-handlers"

type Ctx = { params: Promise<{ id: string }> }

export const PATCH = ruta("proveedores PATCH", async (req: Request, ctx: Ctx) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso
  const { id } = await ctx.params
  return editarEntidad(CONFIG_PROVEEDORES, req, id)
})

export const DELETE = ruta("proveedores DELETE", async (req: Request, ctx: Ctx) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso
  const { id } = await ctx.params
  return borrarEntidad(CONFIG_PROVEEDORES, req, id)
})
