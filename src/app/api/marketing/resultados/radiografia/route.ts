import { NextResponse } from "next/server"

import { ruta } from "@/lib/admin/ruta"
import { exigirModulo } from "@/lib/guard-api"
import { radiografiaDelPeriodo } from "@/lib/marketing/radiografia-server"
import { PERIODOS, rangoAnterior, rangoDe, type Periodo } from "@/lib/marketing/resultados"

/**
 * El desglose por canal, geo, chatbots, landings y gestión de la radiografía.
 *
 * Va aparte de `/api/marketing/resultados` a propósito: es más lento (lee filas,
 * no agregados, y le pide a Google el período anterior) y si falla la
 * radiografía se arma igual con lo estimado. Sumarlo a la ruta principal haría
 * esperar a todas las pestañas por algo que solo usa una.
 */
export const GET = ruta("radiografia GET", async (req) => {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const pedido = new URL(req.url).searchParams.get("periodo") ?? "30d"
  const periodo = (PERIODOS as readonly string[]).includes(pedido) ? (pedido as Periodo) : "30d"

  const cuerpo = await radiografiaDelPeriodo(rangoDe(periodo), rangoAnterior(periodo))
  return NextResponse.json(cuerpo, { headers: { "Cache-Control": "no-store" } })
})
