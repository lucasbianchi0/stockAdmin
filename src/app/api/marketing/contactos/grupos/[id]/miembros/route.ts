import { ruta } from "@/lib/admin/ruta"
import { sesionConModulo } from "@/lib/sesion-server"
import { quitarDeGrupo } from "@/lib/marketing/grupos-server"

/** Sacar personas del grupo: `{ ids | filtro }`. */
export const DELETE = ruta(
  "grupos miembros DELETE",
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const s = await sesionConModulo(["marketing"])
    if ("respuesta" in s) return s.respuesta
    return quitarDeGrupo(req, (await params).id)
  }
)
