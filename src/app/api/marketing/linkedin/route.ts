import { NextResponse } from "next/server"

import { ruta } from "@/lib/admin/ruta"
import { exigirModulo } from "@/lib/guard-api"
import { linkedinDelPeriodo } from "@/lib/marketing/linkedin-server"
import { PERIODOS, rangoAnterior, rangoDe, type Periodo } from "@/lib/marketing/resultados"

/**
 * La pestaña LinkedIn de Resultados.
 *
 * Va aparte de `/api/marketing/resultados` a propósito: esos datos se cruzan
 * entre sí (un lead tiene que caer en la misma campaña que lo trajo) y por eso
 * viajan juntos; LinkedIn no se cruza con nada y cambia sólo cuando alguien
 * importa. Así, importar recarga esta pestaña sin volver a pedirle a Google Ads
 * todo el período.
 */
export const GET = ruta("linkedin GET", async (req) => {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const pedido = new URL(req.url).searchParams.get("periodo") ?? "30d"
  const periodo = (PERIODOS as readonly string[]).includes(pedido) ? (pedido as Periodo) : "30d"

  return NextResponse.json(await linkedinDelPeriodo(rangoDe(periodo), rangoAnterior(periodo)))
})
