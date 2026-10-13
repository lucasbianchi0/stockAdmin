import { ruta } from "@/lib/admin/ruta"
import { sesionConModulo } from "@/lib/sesion-server"
import { fichaEmpresa } from "@/lib/contactos-compartido-server"

/** La ficha de una empresa: `?nombre=`. */
export const GET = ruta("contactos empresa", async (req: Request) => {
  const s = await sesionConModulo(["marketing", "comercial"])
  if ("respuesta" in s) return s.respuesta
  return fichaEmpresa(req)
})
