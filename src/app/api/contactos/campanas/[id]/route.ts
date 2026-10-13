import { ruta } from "@/lib/admin/ruta"
import { sesionConModulo } from "@/lib/sesion-server"
import { borrarCampana } from "@/lib/marketing/campanas-server"

export const DELETE = ruta(
  "campanas DELETE",
  async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const s = await sesionConModulo(["marketing", "comercial"])
    if ("respuesta" in s) return s.respuesta
    return borrarCampana((await params).id)
  }
)
