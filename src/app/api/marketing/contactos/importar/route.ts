import { ruta } from "@/lib/admin/ruta"
import { sesionConModulo } from "@/lib/sesion-server"
import { importarContactos } from "@/lib/marketing/contactos-server"

/** Con un archivo, previsualiza; con `{ filas }`, guarda. Ver `importarContactos`. */
export const POST = ruta("contactos importar", async (req: Request) => {
  const s = await sesionConModulo(["marketing"])
  if ("respuesta" in s) return s.respuesta
  return importarContactos(req, s.sesion)
})
