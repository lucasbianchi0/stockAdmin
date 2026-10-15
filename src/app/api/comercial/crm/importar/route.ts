import { ruta } from "@/lib/admin/ruta"
import { sesionConModulo } from "@/lib/sesion-server"
import { importarProyectos } from "@/lib/comercial/crm-import-server"

/**
 * Importar proyectos desde una planilla. Multipart (`archivo`, `ownerId`):
 * vista previa sin escribir nada. JSON (`filas`, `actualizar`): guarda.
 */
export const POST = ruta("crm importar", async (req: Request) => {
  const s = await sesionConModulo(["comercial"])
  if ("respuesta" in s) return s.respuesta
  return importarProyectos(req, s.sesion)
})
