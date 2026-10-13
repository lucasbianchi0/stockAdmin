import { ruta } from "@/lib/admin/ruta"
import { sesionConModulo } from "@/lib/sesion-server"
import { crearCampana, listarCampanas } from "@/lib/marketing/campanas-server"

/** Las campañas (`?grupo=` para las de un grupo). */
export const GET = ruta("campanas GET", async (req: Request) => {
  const s = await sesionConModulo(["marketing", "comercial"])
  if ("respuesta" in s) return s.respuesta
  return listarCampanas(req)
})

/** Una campaña en borrador desde una selección de Contactos o del CRM. */
export const POST = ruta("campanas POST", async (req: Request) => {
  const s = await sesionConModulo(["marketing", "comercial"])
  if ("respuesta" in s) return s.respuesta
  return crearCampana(req, s.sesion)
})
