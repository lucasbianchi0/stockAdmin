import { exigirModulo } from "@/lib/guard-api"
import { ruta } from "@/lib/admin/ruta"
import { leerFicha } from "@/lib/admin/lectura-handlers"

export const maxDuration = 120

export const POST = ruta("proveedores leer", async (req: Request) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso
  return leerFicha("proveedor", req)
})
