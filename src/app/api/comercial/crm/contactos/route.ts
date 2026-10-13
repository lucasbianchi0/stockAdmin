import { ruta } from "@/lib/admin/ruta"
import { sesionConModulo } from "@/lib/sesion-server"
import { crearContactoEnCrm } from "@/lib/comercial/crm-server"

/** "Nuevo contacto" desde el CRM: alta en Contactos + entra al CRM en un paso. */
export const POST = ruta("crm contactos POST", async (req: Request) => {
  const s = await sesionConModulo(["comercial"])
  if ("respuesta" in s) return s.respuesta
  return crearContactoEnCrm(req, s.sesion)
})
