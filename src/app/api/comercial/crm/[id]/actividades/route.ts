import { ruta } from "@/lib/admin/ruta"
import { sesionConModulo } from "@/lib/sesion-server"
import { crearActividad, listarActividades } from "@/lib/comercial/crm-server"

type Ctx = { params: Promise<{ id: string }> }

export const GET = ruta("crm actividades GET", async (_req: Request, { params }: Ctx) => {
  const s = await sesionConModulo(["comercial"])
  if ("respuesta" in s) return s.respuesta
  const { id } = await params
  return listarActividades(id)
})

export const POST = ruta("crm actividades POST", async (req: Request, { params }: Ctx) => {
  const s = await sesionConModulo(["comercial"])
  if ("respuesta" in s) return s.respuesta
  const { id } = await params
  return crearActividad(req, id, s.sesion)
})
