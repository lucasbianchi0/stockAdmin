import { NextResponse } from "next/server"

import { exigirAdmin } from "@/lib/guard-api"
import { ruta } from "@/lib/admin/ruta"
import { ErrorStock, leerFicha, registrarMovimiento, type DatosMovimiento } from "@/lib/admin/stock-server"

type Ctx = { params: Promise<{ id: string }> }

/**
 * Una entrada o una salida de un ítem. Si deja el saldo negativo, avisa pero la
 * registra. Devuelve la ficha ya actualizada: la pantalla se repinta con esta
 * misma respuesta, sin un segundo pedido.
 */
export const POST = ruta("stock movimiento POST", async (req: Request, { params }: Ctx) => {
  const { error, usuarioId } = await exigirAdmin()
  if (error) return error
  const { id } = await params
  const datos = (await req.json().catch(() => null)) as DatosMovimiento | null
  if (!datos) return NextResponse.json({ error: "Faltan los datos del movimiento" }, { status: 400 })
  try {
    const resultado = await registrarMovimiento(id, datos, usuarioId)
    return NextResponse.json({ ...resultado, ficha: await leerFicha(id) }, { status: 201 })
  } catch (e) {
    if (e instanceof ErrorStock) return NextResponse.json({ error: e.message }, { status: 400 })
    throw e
  }
})
