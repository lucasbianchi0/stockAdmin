import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { ruta } from "@/lib/admin/ruta"
import {
  ErrorBorrador,
  descartarBorrador,
  guardarBorrador,
  type DatosBorrador,
} from "@/lib/admin/asientos-borradores-server"

type Ctx = { params: Promise<{ id: string }> }

export const PATCH = ruta("borrador PATCH", async (req: Request, { params }: Ctx) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso
  const { id } = await params
  const datos = (await req.json().catch(() => null)) as DatosBorrador | null
  if (!datos) return NextResponse.json({ error: "Faltan los datos del asiento" }, { status: 400 })
  try {
    return NextResponse.json(await guardarBorrador(datos, null, id))
  } catch (e) {
    if (e instanceof ErrorBorrador) return NextResponse.json({ error: e.message }, { status: 400 })
    throw e
  }
})

/** Descartar: queda marcado, no se borra. */
export const DELETE = ruta("borrador DELETE", async (_req: Request, { params }: Ctx) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso
  const { id } = await params
  await descartarBorrador(id)
  return NextResponse.json({ ok: true })
})
