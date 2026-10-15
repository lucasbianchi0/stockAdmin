import { ruta } from "@/lib/admin/ruta"
import { sesionConModulo } from "@/lib/sesion-server"
import { crearProyecto } from "@/lib/comercial/crm-server"

/**
 * "+ Proyecto" desde la ficha de una persona en Contactos. Es el mismo alta que
 * el del CRM, colgado de marketing como "Enviar al CRM": quien carga contactos
 * puede abrirle un proyecto sin tener el CRM entero.
 */
export const POST = ruta("contactos proyectos POST", async (req: Request) => {
  const s = await sesionConModulo(["marketing", "comercial"])
  if ("respuesta" in s) return s.respuesta
  return crearProyecto(req, s.sesion)
})
