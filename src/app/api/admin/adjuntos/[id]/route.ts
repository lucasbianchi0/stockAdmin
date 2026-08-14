import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { ruta } from "@/lib/admin/ruta"

type Ctx = { params: Promise<{ id: string }> }

/** Borra el archivo y su fila. Primero la fila: si falla el borrado en Storage
 *  queda un archivo suelto, que es molesto pero inofensivo — al revés quedaría
 *  una fila apuntando a la nada, que sí rompe la pantalla. */
export const DELETE = ruta("adjuntos DELETE", async (_req: Request, ctx: Ctx) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso

  const { id } = await ctx.params

  const { data, error } = await supabase
    .from("comprobante_adjuntos")
    .delete()
    .eq("id", id)
    .select("ruta")
    .maybeSingle()

  if (error) {
    console.error("[adjuntos DELETE]", error)
    return NextResponse.json({ error: "No se pudo borrar el archivo" }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: "El archivo no existe" }, { status: 404 })

  const { error: errStorage } = await supabase.storage
    .from("comprobantes")
    .remove([data.ruta as string])

  if (errStorage) console.error("[adjuntos storage remove]", errStorage)

  return NextResponse.json({ ok: true })
})
