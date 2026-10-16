import { NextResponse } from "next/server"

import { exigirAdmin } from "@/lib/guard-api"
import { ruta } from "@/lib/admin/ruta"
import { leerFicha } from "@/lib/admin/stock-server"

type Ctx = { params: Promise<{ id: string }> }

/** La ficha de un ítem: su saldo, cada movimiento con el saldo corrido y sus series. */
export const GET = ruta("stock ficha GET", async (_req: Request, { params }: Ctx) => {
  const { error } = await exigirAdmin()
  if (error) return error
  const { id } = await params
  const ficha = await leerFicha(id)
  if (!ficha) return NextResponse.json({ error: "Ese ítem no existe" }, { status: 404 })
  return NextResponse.json(ficha)
})
