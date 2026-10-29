import { NextResponse } from "next/server"

import { ruta } from "@/lib/admin/ruta"
import { exigirModulo } from "@/lib/guard-api"
import { esClaveAgente } from "@/lib/agentes"
import { detalleDeAgente, resumenDelEquipo } from "@/lib/agentes-server"

/**
 * Sin parámetros, el equipo: si corrió cada uno y cuánto espera decisión.
 * Con `?clave=agente-blog`, la ficha: todas sus entregas y sus corridas.
 */
export const GET = ruta("agentes GET", async (req: Request) => {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const clave = new URL(req.url).searchParams.get("clave")
  if (clave === null) return NextResponse.json({ equipo: await resumenDelEquipo() })
  if (!esClaveAgente(clave)) return NextResponse.json({ error: "No existe ese agente" }, { status: 404 })
  return NextResponse.json({ agente: await detalleDeAgente(clave) })
})
