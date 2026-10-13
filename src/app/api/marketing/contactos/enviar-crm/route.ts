import { ruta } from "@/lib/admin/ruta"
import { sesionConModulo } from "@/lib/sesion-server"
import { enviarAlCrm } from "@/lib/comercial/crm-server"

/**
 * La barra de selección de Contactos. Cuelga de marketing y no de comercial
 * porque es marketing quien la dispara: así no hace falta abrirle el CRM entero
 * a quien solo carga contactos.
 */
export const POST = ruta("contactos enviar-crm", async (req: Request) => {
  const s = await sesionConModulo(["marketing"])
  if ("respuesta" in s) return s.respuesta
  return enviarAlCrm(req, s.sesion)
})
