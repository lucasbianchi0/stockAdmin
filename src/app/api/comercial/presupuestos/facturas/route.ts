import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { ruta } from "@/lib/admin/ruta"
import { conciliarSinFallar, facturasPorPresupuesto } from "@/lib/comercial/presupuesto-facturas-server"

/**
 * Para el reporte de Comercial: qué facturas tiene cada presupuesto, y de los
 * que tienen el PDF en el legajo pero no la factura cargada, cuál falta.
 * Antes de leer, vincula las que el legajo ya permite vincular.
 */
export const GET = ruta("facturas por presupuesto GET", async () => {
  const sinPermiso = await exigirModulo("comercial")
  if (sinPermiso) return sinPermiso
  // En paralelo: casi siempre no hay nada nuevo que vincular, y entonces lo
  // leído ya es la respuesta. Sólo si se vinculó algo se vuelve a leer.
  const [{ faltan, nuevos }, facturas] = await Promise.all([conciliarSinFallar(), facturasPorPresupuesto()])
  return NextResponse.json({ facturas: nuevos ? await facturasPorPresupuesto() : facturas, faltan })
})
