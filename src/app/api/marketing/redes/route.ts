import { NextResponse } from "next/server"

import { ruta } from "@/lib/admin/ruta"
import { exigirModulo } from "@/lib/guard-api"
import { REDES, type Red } from "@/lib/marketing/redes"
import { redDelPeriodo } from "@/lib/marketing/redes-server"
import { PERIODOS, rangoAnterior, rangoDe, type Periodo } from "@/lib/marketing/resultados"

/** Las pestañas Instagram y Facebook de Resultados. Lee lo que guardó el cron; no le pide nada a Meta. */
export const GET = ruta("redes GET", async (req) => {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const params = new URL(req.url).searchParams
  const red = params.get("red") ?? ""
  if (!(REDES as readonly string[]).includes(red)) {
    return NextResponse.json({ error: "Red desconocida" }, { status: 400 })
  }
  const pedido = params.get("periodo") ?? "30d"
  const periodo = (PERIODOS as readonly string[]).includes(pedido) ? (pedido as Periodo) : "30d"

  return NextResponse.json(await redDelPeriodo(red as Red, rangoDe(periodo), rangoAnterior(periodo)))
})
