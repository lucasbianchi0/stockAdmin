import { ruta } from "@/lib/admin/ruta"
import { sesionConModulo } from "@/lib/sesion-server"
import {
  editarOportunidades,
  enviarAlCrm,
  listarCrm,
  quitarDelCrm,
} from "@/lib/comercial/crm-server"

/** El CRM de una persona: `?owner=<id>`, o el propio si no viene. */
export const GET = ruta("crm GET", async (req: Request) => {
  const s = await sesionConModulo(["comercial"])
  if ("respuesta" in s) return s.respuesta
  return listarCrm(req, s.sesion)
})

/** Sumar contactos a un CRM: `{ contactoIds, ownerId? }`. */
export const POST = ruta("crm POST", async (req: Request) => {
  const s = await sesionConModulo(["comercial"])
  if ("respuesta" in s) return s.respuesta
  return enviarAlCrm(req, s.sesion)
})

/** Cambio masivo: `{ ids, estado }` (o cualquier otro campo editable). */
export const PATCH = ruta("crm PATCH", async (req: Request) => {
  const s = await sesionConModulo(["comercial"])
  if ("respuesta" in s) return s.respuesta
  return editarOportunidades(req, s.sesion)
})

/** Sacar del CRM: `{ ids }`. El contacto sigue en Marketing. */
export const DELETE = ruta("crm DELETE", async (req: Request) => {
  const s = await sesionConModulo(["comercial"])
  if ("respuesta" in s) return s.respuesta
  return quitarDelCrm(req, s.sesion)
})
