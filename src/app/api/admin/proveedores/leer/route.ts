import { exigirModulo } from "@/lib/guard-api"
import { ruta } from "@/lib/admin/ruta"
import { leerFicha } from "@/lib/admin/lectura-handlers"

/** Tope del plan hobby de Vercel; con Pro esto puede volver a 120. */
export const maxDuration = 60

export const POST = ruta("proveedores leer", async (req: Request) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso
  return leerFicha("proveedor", req)
})
