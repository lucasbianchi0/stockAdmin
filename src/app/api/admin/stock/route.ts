import { NextResponse } from "next/server"

import { exigirAdmin } from "@/lib/guard-api"
import { ruta } from "@/lib/admin/ruta"
import { ErrorStock, crearItem, leerFicha, leerItems, type DatosItem } from "@/lib/admin/stock-server"

/** El listado de ítems con su saldo, y el alta de uno con su stock inicial. */

export const GET = ruta("stock GET", async () => {
  const { error } = await exigirAdmin()
  if (error) return error
  return NextResponse.json({ items: await leerItems() })
})

export const POST = ruta("stock POST", async (req: Request) => {
  const { error, usuarioId } = await exigirAdmin()
  if (error) return error
  const datos = (await req.json().catch(() => null)) as DatosItem | null
  if (!datos) return NextResponse.json({ error: "Faltan los datos del ítem" }, { status: 400 })
  try {
    // Con la ficha en la respuesta, la pantalla del ítem nuevo abre ya cargada.
    const creado = await crearItem(datos, usuarioId)
    return NextResponse.json({ ...creado, ficha: await leerFicha(creado.id) }, { status: 201 })
  } catch (e) {
    if (e instanceof ErrorStock) return NextResponse.json({ error: e.message }, { status: 400 })
    throw e
  }
})
