import { exigirModulo } from "@/lib/guard-api"
import { ruta } from "@/lib/admin/ruta"
import { crearComprobante, listarComprobantes } from "@/lib/admin/comprobantes-handlers"

export const GET = ruta("ventas GET", async (req: Request) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso
  return listarComprobantes("venta", req)
})

export const POST = ruta("ventas POST", async (req: Request) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso
  return crearComprobante("venta", req)
})
