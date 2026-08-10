import { exigirModulo } from "@/lib/guard-api"
import { ruta } from "@/lib/admin/ruta"
import { importarComprobantes } from "@/lib/admin/importar-server"

/**
 * Leer un comprobante escaneado lleva su tiempo, y son varios en paralelo: con
 * 60 segundos entran pocos archivos por tanda. Es el tope del plan hobby de
 * Vercel, no una medición; con Pro esto vuelve a 300.
 */
export const maxDuration = 60

export const POST = ruta("compras importar", async (req: Request) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso
  return importarComprobantes("compra", req)
})
