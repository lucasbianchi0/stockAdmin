import { ruta } from "@/lib/admin/ruta"
import { sesionConModulo } from "@/lib/sesion-server"
import { editarEnLote } from "@/lib/marketing/contactos-server"

/** AM o vertical de muchos a la vez: `{ ids | filtro, amId?, vertical? }`. */
export const PATCH = ruta("contactos lote", async (req: Request) => {
  const s = await sesionConModulo(["marketing"])
  if ("respuesta" in s) return s.respuesta
  return editarEnLote(req)
})
