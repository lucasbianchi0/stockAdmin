import { ruta } from "@/lib/admin/ruta"
import { sesionConModulo } from "@/lib/sesion-server"
import { usarPlantilla } from "@/lib/contactos-compartido-server"

/** Suma un uso a la plantilla, igual que copiarla desde Plantillas de mensajes. */
export const POST = ruta(
  "contactos plantilla uso",
  async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const s = await sesionConModulo(["marketing", "comercial"])
    if ("respuesta" in s) return s.respuesta
    const { id } = await params
    return usarPlantilla(id)
  }
)
