import { ruta } from "@/lib/admin/ruta"
import { sesionConModulo } from "@/lib/sesion-server"
import { crearProyecto } from "@/lib/comercial/crm-server"

/** "+ Proyecto": `{ contactoId, proyecto, ownerId? }`. */
export const POST = ruta("crm proyectos POST", async (req: Request) => {
  const s = await sesionConModulo(["comercial"])
  if ("respuesta" in s) return s.respuesta
  return crearProyecto(req, s.sesion)
})
