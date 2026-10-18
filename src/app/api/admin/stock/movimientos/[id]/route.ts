import { NextResponse } from "next/server"

import { exigirAdmin } from "@/lib/guard-api"
import { ruta } from "@/lib/admin/ruta"
import { ErrorStock, borrarMovimiento, leerFicha } from "@/lib/admin/stock-server"

type Ctx = { params: Promise<{ id: string }> }

/** Deshacer un movimiento cargado por error. Devuelve la ficha del ítem ya actualizada. */
export const DELETE = ruta("stock movimiento DELETE", async (_req: Request, { params }: Ctx) => {
  const { error } = await exigirAdmin()
  if (error) return error
  const { id } = await params
  try {
    const itemId = await borrarMovimiento(id)
    return NextResponse.json({ ok: true, ficha: itemId ? await leerFicha(itemId) : null })
  } catch (e) {
    if (e instanceof ErrorStock) return NextResponse.json({ error: e.message }, { status: 400 })
    throw e
  }
})
