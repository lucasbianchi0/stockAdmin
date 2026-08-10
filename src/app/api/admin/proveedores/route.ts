import { exigirModulo } from "@/lib/guard-api"
import { ruta } from "@/lib/admin/ruta"
import {
  CONFIG_PROVEEDORES,
  crearEntidad,
  listarEntidades,
} from "@/lib/admin/entidades-handlers"

export const GET = ruta("proveedores GET", async (req: Request) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso
  return listarEntidades(CONFIG_PROVEEDORES, req)
})

export const POST = ruta("proveedores POST", async (req: Request) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso
  return crearEntidad(CONFIG_PROVEEDORES, req)
})
