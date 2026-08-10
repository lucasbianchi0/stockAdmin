import { exigirModulo } from "@/lib/guard-api"
import { ruta } from "@/lib/admin/ruta"
import { leerGasto } from "@/lib/admin/lectura-handlers"

/** Tope del plan hobby de Vercel; con Pro esto puede volver a 120. */
export const maxDuration = 60

export const POST = ruta("movimientos leer", async (req: Request) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso
  return leerGasto(req)
})
