import { ruta } from "@/lib/admin/ruta"
import { sesionConModulo } from "@/lib/sesion-server"
import { plantillasParaEnviar } from "@/lib/contactos-compartido-server"

/** Las plantillas de mensajes, para escribirle a un contacto. */
export const GET = ruta("contactos plantillas", async () => {
  const s = await sesionConModulo(["marketing", "comercial"])
  if ("respuesta" in s) return s.respuesta
  return plantillasParaEnviar()
})
