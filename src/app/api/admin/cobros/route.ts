import { exigirModulo } from "@/lib/guard-api"
import { ruta } from "@/lib/admin/ruta"
import { crearPago, listarPagos } from "@/lib/admin/pagos-handlers"

export const GET = ruta("cobros GET", async (req: Request) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso
  return listarPagos("cobro", req)
})

export const POST = ruta("cobros POST", async (req: Request) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso
  return crearPago("cobro", req)
})
