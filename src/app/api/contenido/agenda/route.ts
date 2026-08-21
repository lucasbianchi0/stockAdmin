import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { piezasProgramadas } from "@/lib/banco-server"
import { esFechaISO } from "@/lib/calendario-context"

/**
 * Las piezas programadas de un rango de fechas.
 *
 * Por rango y no todas: la vista de mes pide justo el mes que está mirando, más
 * los días de relleno de la primera y la última semana. Traer la agenda entera
 * funcionaría hoy —hay decenas de piezas— y dejaría de funcionar sin aviso
 * cuando sean cientos, que es la clase de límite que conviene no cruzar.
 */
export async function GET(req: Request) {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const params = new URL(req.url).searchParams
  const desde = params.get("desde")
  const hasta = params.get("hasta")

  if (!esFechaISO(desde) || !esFechaISO(hasta)) {
    return NextResponse.json({ error: "Rango inválido" }, { status: 400 })
  }
  if (desde > hasta) {
    return NextResponse.json({ error: "El rango está al revés" }, { status: 400 })
  }

  return NextResponse.json({ piezas: await piezasProgramadas(desde, hasta) })
}
