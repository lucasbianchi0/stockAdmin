import { exigirModulo } from "@/lib/guard-api"
import { ruta } from "@/lib/admin/ruta"
import { importarComprobantes } from "@/lib/admin/importar-server"

/** Leer un comprobante escaneado lleva su tiempo, y son varios en paralelo. */
export const maxDuration = 300

export const POST = ruta("compras importar", async (req: Request) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso
  return importarComprobantes("compra", req)
})
