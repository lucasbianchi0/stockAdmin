import { exigirModulo } from "@/lib/guard-api"
import { ruta } from "@/lib/admin/ruta"
import { importarComprobantesCsv } from "@/lib/admin/importar-server"

/**
 * Una planilla son cientos de filas y dos consultas por fila. No hay modelo de
 * por medio, así que es rápido, pero no instantáneo: 60 segundos es el tope del
 * plan hobby de Vercel y alcanza de sobra para las 300 filas del techo.
 */
export const maxDuration = 60

export const POST = ruta("compras importar-csv", async (req: Request) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso
  return importarComprobantesCsv("compra", req)
})
