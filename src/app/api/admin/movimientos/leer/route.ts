import { exigirModulo } from "@/lib/guard-api"
import { ruta } from "@/lib/admin/ruta"
import { leerGasto } from "@/lib/admin/lectura-handlers"

export const maxDuration = 120

export const POST = ruta("movimientos leer", async (req: Request) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso
  return leerGasto(req)
})
