import { exigirModulo } from "@/lib/guard-api"
import { ruta } from "@/lib/admin/ruta"
import { confirmarLote } from "@/lib/admin/comprobantes-handlers"

/** Confirmar varios borradores de una vez, que es lo que hace usable la carga
 *  inteligente de a seis PDF. */
export const POST = ruta("ventas confirmar POST", async (req: Request) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso
  return confirmarLote("venta", req)
})
