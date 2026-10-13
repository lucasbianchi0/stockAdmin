import { ruta } from "@/lib/admin/ruta"
import { sesionConModulo } from "@/lib/sesion-server"
import { agregarAGrupo, listarGrupos } from "@/lib/marketing/grupos-server"

export const GET = ruta("grupos GET", async () => {
  const s = await sesionConModulo(["marketing"])
  if ("respuesta" in s) return s.respuesta
  return listarGrupos()
})

/** Sumar a un grupo (o crearlo): `{ grupoId | nuevoNombre, ids | filtro }`. */
export const POST = ruta("grupos POST", async (req: Request) => {
  const s = await sesionConModulo(["marketing"])
  if ("respuesta" in s) return s.respuesta
  return agregarAGrupo(req, s.sesion)
})
