import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { ruta } from "@/lib/admin/ruta"
import { createSupabaseServer } from "@/lib/supabase-server"
import { ErrorBorrador, proponerCierre } from "@/lib/admin/asientos-borradores-server"

/** Arma (como borrador) el asiento de cierre de un ejercicio con lo asentado. */
export const POST = ruta("proponer cierre POST", async (req: Request) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso
  const { ejercicioId } = (await req.json().catch(() => ({}))) as { ejercicioId?: number }
  if (!ejercicioId) return NextResponse.json({ error: "Elegí el ejercicio" }, { status: 400 })
  const usuario = await (await createSupabaseServer()).auth.getUser()
  try {
    return NextResponse.json(await proponerCierre(ejercicioId, usuario.data.user?.id ?? null), { status: 201 })
  } catch (e) {
    if (e instanceof ErrorBorrador) return NextResponse.json({ error: e.message }, { status: 400 })
    throw e
  }
})
