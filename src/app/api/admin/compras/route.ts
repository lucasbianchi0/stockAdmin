import { exigirModulo } from "@/lib/guard-api"
import { ruta } from "@/lib/admin/ruta"
import { crearComprobante, listarComprobantes } from "@/lib/admin/comprobantes-handlers"

export const GET = ruta("compras GET", async (req: Request) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso
  return listarComprobantes("compra", req)
})

export const POST = ruta("compras POST", async (req: Request) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso
  return crearComprobante("compra", req)
})
