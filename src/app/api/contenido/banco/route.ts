import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { piezasDelBanco } from "@/lib/banco-server"
import { esCanal } from "@/lib/calendario-context"

/**
 * El banco de un canal: lo generado que todavía no se programó.
 *
 * Solo las que no tienen fecha. Una vez exportada, la pieza deja de estar acá y
 * aparece en la agenda — es el mismo objeto moviéndose de pantalla, no una copia,
 * así que la imagen y el copy que se revisaron son exactamente los que se van a
 * publicar.
 */
export async function GET(req: Request) {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const canal = new URL(req.url).searchParams.get("canal")
  if (!esCanal(canal)) return NextResponse.json({ error: "Canal inválido" }, { status: 400 })

  return NextResponse.json({ piezas: await piezasDelBanco(canal) })
}
