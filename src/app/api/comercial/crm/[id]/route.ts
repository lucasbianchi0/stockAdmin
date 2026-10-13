import { ruta } from "@/lib/admin/ruta"
import { sesionConModulo } from "@/lib/sesion-server"
import { editarOportunidades } from "@/lib/comercial/crm-server"

export const PATCH = ruta(
  "crm PATCH id",
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const s = await sesionConModulo(["comercial"])
    if ("respuesta" in s) return s.respuesta
    const { id } = await params
    return editarOportunidades(req, s.sesion, id)
  }
)
