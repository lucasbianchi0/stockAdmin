import { ruta } from "@/lib/admin/ruta"
import { sesionConModulo } from "@/lib/sesion-server"
import { pendientesCrm } from "@/lib/comercial/crm-server"

/** Las próximas acciones vencidas o de hoy del CRM propio, para el menú. */
export const GET = ruta("crm pendientes", async () => {
  const s = await sesionConModulo(["comercial"])
  if ("respuesta" in s) return s.respuesta
  return pendientesCrm(s.sesion)
})
