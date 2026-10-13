import { ruta } from "@/lib/admin/ruta"
import { sesionConModulo } from "@/lib/sesion-server"
import { resumenContactos } from "@/lib/marketing/contactos-server"

/** Empresas, verticales y las opciones de los filtros. Ver `resumenContactos`. */
export const GET = ruta("contactos resumen GET", async () => {
  const s = await sesionConModulo(["marketing"])
  if ("respuesta" in s) return s.respuesta
  return resumenContactos()
})
