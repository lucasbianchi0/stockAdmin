import { ruta } from "@/lib/admin/ruta"
import { sesionConModulo } from "@/lib/sesion-server"
import { similares } from "@/lib/contactos-compartido-server"

/** ¿Ya existe alguien así? Lo pide el formulario mientras se escribe. */
export const GET = ruta("contactos similares", async (req: Request) => {
  const s = await sesionConModulo(["marketing", "comercial"])
  if ("respuesta" in s) return s.respuesta
  return similares(req)
})
