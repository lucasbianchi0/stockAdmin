import { exigirModulo } from "@/lib/guard-api"
import { ruta } from "@/lib/admin/ruta"
import { crearPresupuesto, listarPresupuestos } from "@/lib/comercial/presupuestos-server"

/** El listado, con búsqueda por número, referencia, cliente o vendedor. */
export const GET = ruta("presupuestos GET", async (req: Request) => {
  const sinPermiso = await exigirModulo("comercial")
  if (sinPermiso) return sinPermiso
  return listarPresupuestos(req)
})

/** Un presupuesto nuevo: nace con su número y en borrador. */
export const POST = ruta("presupuestos POST", async (req: Request) => {
  const sinPermiso = await exigirModulo("comercial")
  if (sinPermiso) return sinPermiso
  return crearPresupuesto(req)
})
