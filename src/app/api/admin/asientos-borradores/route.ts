import { NextResponse } from "next/server"

import { exigirModulo, exigirModuloConUsuario } from "@/lib/guard-api"
import { ruta } from "@/lib/admin/ruta"
import { TIPOS_BORRADOR, type TipoBorrador } from "@/lib/admin/asientos-borradores"
import {
  ErrorBorrador,
  guardarBorrador,
  listarBorradores,
  type DatosBorrador,
} from "@/lib/admin/asientos-borradores-server"

/** Los borradores de asientos manuales (apertura, ajuste, cierre) y el alta de uno. */

export const GET = ruta("borradores GET", async (req: Request) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso
  const pedidos = (new URL(req.url).searchParams.get("tipos") ?? "").split(",")
  const tipos = pedidos.filter((t): t is TipoBorrador => (TIPOS_BORRADOR as readonly string[]).includes(t))
  return NextResponse.json({ borradores: await listarBorradores(tipos.length ? tipos : [...TIPOS_BORRADOR]) })
})

export const POST = ruta("borradores POST", async (req: Request) => {
  // Con el id de quien carga, de la misma lectura del token que el permiso.
  const s = await exigirModuloConUsuario(["administracion"])
  if (s.error) return s.error
  const datos = (await req.json().catch(() => null)) as DatosBorrador | null
  if (!datos) return NextResponse.json({ error: "Faltan los datos del asiento" }, { status: 400 })
  try {
    return NextResponse.json(await guardarBorrador(datos, s.usuarioId), { status: 201 })
  } catch (e) {
    if (e instanceof ErrorBorrador) return NextResponse.json({ error: e.message }, { status: 400 })
    throw e
  }
})
