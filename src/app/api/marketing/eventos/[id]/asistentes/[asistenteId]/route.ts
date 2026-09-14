import { NextResponse } from "next/server"

import { ruta } from "@/lib/admin/ruta"
import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { HORAS_MAX, LIMITES } from "@/lib/marketing/eventos"
import { COLUMNAS_ASISTENTE, aAsistente } from "@/lib/marketing/eventos-server"

type Ctx = { params: Promise<{ id: string; asistenteId: string }> }

/**
 * Corregir un asistente: el nombre mal escrito, las horas de quien se fue antes.
 * El código NO se edita nunca: si ya se entregó el certificado, cambiarlo
 * invalida el papel que la persona tiene en la mano.
 */
export const PATCH = ruta("asistente PATCH", async (req: Request, ctx: Ctx) => {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const { id, asistenteId } = await ctx.params

  let b: Record<string, unknown>
  try {
    b = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 })
  }

  const nombre = String(b.nombre ?? "").trim().replace(/\s+/g, " ").slice(0, LIMITES.asistenteNombre)
  if (!nombre) return NextResponse.json({ error: "Falta el nombre" }, { status: 400 })

  const horasCrudas = b.horas === null || b.horas === "" ? null : Number(b.horas)
  const horas =
    horasCrudas !== null && Number.isFinite(horasCrudas) && horasCrudas > 0
      ? Math.min(HORAS_MAX, Math.round(horasCrudas * 10) / 10)
      : null

  const { data, error } = await supabase
    .from("evento_asistentes")
    .update({
      nombre,
      email: String(b.email ?? "").trim().toLowerCase().slice(0, LIMITES.asistenteEmail) || null,
      empresa: String(b.empresa ?? "").trim().slice(0, LIMITES.asistenteEmpresa) || null,
      horas,
    })
    .eq("id", asistenteId)
    .eq("evento_id", id)
    .select(COLUMNAS_ASISTENTE)
    .single()

  if (error || !data) {
    console.error("[asistente PATCH]", error)
    return NextResponse.json({ error: "No se pudo guardar" }, { status: 500 })
  }

  return NextResponse.json({ asistente: aAsistente(data) })
})

export const DELETE = ruta("asistente DELETE", async (_req: Request, ctx: Ctx) => {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const { id, asistenteId } = await ctx.params

  const { error } = await supabase
    .from("evento_asistentes")
    .delete()
    .eq("id", asistenteId)
    .eq("evento_id", id)

  if (error) {
    console.error("[asistente DELETE]", error)
    return NextResponse.json({ error: "No se pudo borrar" }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
})
