import { ruta } from "@/lib/admin/ruta"
import { sesionConModulo } from "@/lib/sesion-server"
import { editarContacto } from "@/lib/marketing/contactos-server"

export const PATCH = ruta(
  "contactos PATCH",
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const s = await sesionConModulo(["marketing"])
    if ("respuesta" in s) return s.respuesta
    const { id } = await params
    return editarContacto(req, id)
  }
)
