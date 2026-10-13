import { ruta } from "@/lib/admin/ruta"
import { sesionConModulo } from "@/lib/sesion-server"
import { agregarAGrupo, listarGrupos } from "@/lib/marketing/grupos-server"

/**
 * Los grupos, también desde el CRM: lo elegido ahí se junta en un grupo (la
 * audiencia de una campaña) igual que desde Contactos. Mismas funciones que
 * `/api/marketing/contactos/grupos`, con el permiso de los dos módulos.
 */
export const GET = ruta("contactos grupos GET", async () => {
  const s = await sesionConModulo(["marketing", "comercial"])
  if ("respuesta" in s) return s.respuesta
  return listarGrupos()
})

/** `{ grupoId | nuevoNombre, ids }`: los ids son de contactos. */
export const POST = ruta("contactos grupos POST", async (req: Request) => {
  const s = await sesionConModulo(["marketing", "comercial"])
  if ("respuesta" in s) return s.respuesta
  return agregarAGrupo(req, s.sesion)
})
