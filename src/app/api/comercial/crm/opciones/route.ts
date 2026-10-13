import { exigirModulo } from "@/lib/guard-api"
import { ruta } from "@/lib/admin/ruta"
import { opcionesContacto } from "@/lib/comercial/crm-server"

/** Las sugerencias del formulario "Nuevo contacto" del CRM. */
export const GET = ruta("crm opciones GET", async () => {
  const sinPermiso = await exigirModulo("comercial")
  if (sinPermiso) return sinPermiso
  return opcionesContacto()
})
