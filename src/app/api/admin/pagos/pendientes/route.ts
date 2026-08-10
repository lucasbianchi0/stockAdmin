import { exigirModulo } from "@/lib/guard-api"
import { ruta } from "@/lib/admin/ruta"
import { listarPendientes } from "@/lib/admin/pendientes-server"

export const GET = ruta("pagos pendientes", async (req: Request) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso
  return listarPendientes("pago", req)
})
