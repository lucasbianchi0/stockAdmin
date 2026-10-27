import { NextResponse } from "next/server"

import { exigirModuloConUsuario } from "@/lib/guard-api"
import { ruta } from "@/lib/admin/ruta"
import { ErrorBorrador, proponerCierre } from "@/lib/admin/asientos-borradores-server"

/** Arma (como borrador) el asiento de cierre de un ejercicio con lo asentado. */
export const POST = ruta("proponer cierre POST", async (req: Request) => {
  // Con el id de quien carga, de la misma lectura del token que el permiso.
  const s = await exigirModuloConUsuario(["administracion"])
  if (s.error) return s.error
  const { ejercicioId } = (await req.json().catch(() => ({}))) as { ejercicioId?: number }
  if (!ejercicioId) return NextResponse.json({ error: "Elegí el ejercicio" }, { status: 400 })
  try {
    return NextResponse.json(await proponerCierre(ejercicioId, s.usuarioId), { status: 201 })
  } catch (e) {
    if (e instanceof ErrorBorrador) return NextResponse.json({ error: e.message }, { status: 400 })
    throw e
  }
})
