import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { ruta } from "@/lib/admin/ruta"
import { facturasPorPresupuesto } from "@/lib/comercial/presupuesto-facturas-server"

/** Para el reporte de Comercial: qué facturas tiene cada presupuesto. */
export const GET = ruta("facturas por presupuesto GET", async () => {
  const sinPermiso = await exigirModulo("comercial")
  if (sinPermiso) return sinPermiso
  return NextResponse.json({ facturas: await facturasPorPresupuesto() })
})
