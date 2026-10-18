import { NextResponse } from "next/server"

import { exigirAdmin } from "@/lib/guard-api"
import { ruta } from "@/lib/admin/ruta"
import { ErrorStock, borrarItem, editarItem, leerFicha, type DatosItem } from "@/lib/admin/stock-server"

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

/** Corregir los datos del ítem: nombre, código, para qué es y en qué se mide. Devuelve la ficha actualizada. */
export const PATCH = ruta("stock ficha PATCH", async (req: Request, { params }: Ctx) => {
  const { error } = await exigirAdmin()
  if (error) return error
  const { id } = await params
  const datos = (await req.json().catch(() => null)) as Omit<DatosItem, "inicial"> | null
  if (!datos) return NextResponse.json({ error: "Faltan los datos del ítem" }, { status: 400 })
  try {
    await editarItem(id, datos)
    return NextResponse.json({ ok: true, ficha: await leerFicha(id) })
  } catch (e) {
    if (e instanceof ErrorStock) return NextResponse.json({ error: e.message }, { status: 400 })
    throw e
  }
})

/** Borrar el ítem con sus movimientos y series. Las facturas no se tocan. */
export const DELETE = ruta("stock ficha DELETE", async (_req: Request, { params }: Ctx) => {
  const { error } = await exigirAdmin()
  if (error) return error
  const { id } = await params
  try {
    await borrarItem(id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof ErrorStock) return NextResponse.json({ error: e.message }, { status: 400 })
    throw e
  }
})
