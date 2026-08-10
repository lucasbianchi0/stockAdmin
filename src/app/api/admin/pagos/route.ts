import { exigirModulo } from "@/lib/guard-api"
import { ruta } from "@/lib/admin/ruta"
import { crearPago, listarPagos } from "@/lib/admin/pagos-handlers"

export const GET = ruta("pagos GET", async (req: Request) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso
  return listarPagos("pago", req)
})

export const POST = ruta("pagos POST", async (req: Request) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso
  return crearPago("pago", req)
})
