import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { ruta } from "@/lib/admin/ruta"
import { createSupabaseServer } from "@/lib/supabase-server"
import { respuestaPeriodoCerrado } from "@/lib/admin/cierre-server"

/**
 * La fecha de registro de una factura, cuando es distinta de la del comprobante.
 *
 * Vive en `comprobante_registro` y no en `comprobantes` (ver la migración
 * 20261016_02): guardarla no toca la factura, así que no regenera su asiento.
 * Sin fila, la fecha de registro es la del comprobante; mandar `null` la borra.
 */

export const GET = ruta("registro GET", async (req: Request) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso
  const id = new URL(req.url).searchParams.get("id") ?? ""
  const { data, error } = await supabase
    .from("comprobante_registro")
    .select("fecha_registro")
    .eq("comprobante_id", id)
    .maybeSingle()
  if (error) throw error
  return NextResponse.json({ fechaRegistro: (data?.fecha_registro as string | undefined) ?? null })
})

export const PUT = ruta("registro PUT", async (req: Request) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso
  const { comprobanteId, fechaRegistro } = (await req.json().catch(() => ({}))) as {
    comprobanteId?: string
    fechaRegistro?: string | null
  }
  if (!comprobanteId) return NextResponse.json({ error: "Falta la factura" }, { status: 400 })

  const { data: c } = await supabase.from("comprobantes").select("fecha").eq("id", comprobanteId).maybeSingle()
  if (!c) return NextResponse.json({ error: "La factura no existe" }, { status: 404 })

  // Igual a la del comprobante es lo mismo que no tenerla: no se guarda.
  if (!fechaRegistro || fechaRegistro === c.fecha) {
    const { error } = await supabase.from("comprobante_registro").delete().eq("comprobante_id", comprobanteId)
    const cerrado = respuestaPeriodoCerrado(error)
    if (cerrado) return cerrado
    if (error) throw error
    return NextResponse.json({ fechaRegistro: null })
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaRegistro)) {
    return NextResponse.json({ error: "La fecha de registro no es válida" }, { status: 400 })
  }

  const usuario = await (await createSupabaseServer()).auth.getUser()
  const { error } = await supabase.from("comprobante_registro").upsert({
    comprobante_id: comprobanteId,
    fecha_registro: fechaRegistro,
    updated_at: new Date().toISOString(),
    updated_by: usuario.data.user?.id ?? null,
  })
  // Mover la fecha de registro mueve la factura de período: el cierre lo
  // frena si la de antes o la de después están cerradas.
  const cerrado = respuestaPeriodoCerrado(error)
  if (cerrado) return cerrado
  if (error) throw error
  return NextResponse.json({ fechaRegistro })
})
