import { ruta } from "@/lib/admin/ruta"
import { sesionConModulo } from "@/lib/sesion-server"
import {
  borrarContactos,
  crearContacto,
  listarContactos,
} from "@/lib/marketing/contactos-server"

/** El listado paginado, con los números de las pestañas. */
export const GET = ruta("contactos GET", async (req: Request) => {
  const s = await sesionConModulo(["marketing"])
  if ("respuesta" in s) return s.respuesta
  return listarContactos(req)
})

export const POST = ruta("contactos POST", async (req: Request) => {
  const s = await sesionConModulo(["marketing"])
  if ("respuesta" in s) return s.respuesta
  return crearContacto(req, s.sesion)
})

/** Baja de varios a la vez: `{ ids }`. */
export const DELETE = ruta("contactos DELETE", async (req: Request) => {
  const s = await sesionConModulo(["marketing"])
  if ("respuesta" in s) return s.respuesta
  return borrarContactos(req)
})
