import { ruta } from "@/lib/admin/ruta"
import { sesionConModulo } from "@/lib/sesion-server"
import { borrarGrupo, editarGrupo } from "@/lib/marketing/grupos-server"

type Ctx = { params: Promise<{ id: string }> }

export const PATCH = ruta("grupos PATCH", async (req: Request, { params }: Ctx) => {
  const s = await sesionConModulo(["marketing"])
  if ("respuesta" in s) return s.respuesta
  return editarGrupo(req, (await params).id)
})

export const DELETE = ruta("grupos DELETE", async (_req: Request, { params }: Ctx) => {
  const s = await sesionConModulo(["marketing"])
  if ("respuesta" in s) return s.respuesta
  return borrarGrupo((await params).id)
})
