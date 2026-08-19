import { exigirModulo } from "@/lib/guard-api"
import { ruta } from "@/lib/admin/ruta"
import { imputarDocumento } from "@/lib/admin/pendientes-contables-server"

/** Asignarle la cuenta contable a un documento que quedó sin asiento. Es el
 *  botón «Corregir» de los carteles: un solo campo, sin pasar por la edición
 *  completa del comprobante. */
export const POST = ruta("imputar documento POST", async (req: Request) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso
  return imputarDocumento(req)
})
