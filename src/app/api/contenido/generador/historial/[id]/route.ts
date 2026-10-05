import { NextResponse } from "next/server"

import { ruta } from "@/lib/admin/ruta"
import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { BUCKET_GENERADOR } from "@/lib/generador"
import { aEntradas, rutaMiniatura } from "@/lib/generador-server"

type Ctx = { params: Promise<{ id: string }> }

/** Un resultado, para reabrirlo en su generador desde el historial. */
export const GET = ruta("generador historial GET id", async (_req: Request, ctx: Ctx) => {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const { id } = await ctx.params
  const { data, error } = await supabase.from("generador_historial").select("*").eq("id", id).maybeSingle()

  if (error) {
    console.error("[generador historial GET id]", error)
    return NextResponse.json({ error: "No se pudo cargar" }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: "No existe" }, { status: 404 })

  const [entrada] = await aEntradas([data])
  return NextResponse.json({ entrada })
})

/** Borra un resultado del historial. Primero la fila, después el archivo:
 *  un archivo suelto es inofensivo, una fila apuntando a la nada no. */
export const DELETE = ruta("generador historial DELETE", async (_req: Request, ctx: Ctx) => {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const { id } = await ctx.params

  const { data, error } = await supabase
    .from("generador_historial")
    .delete()
    .eq("id", id)
    .select("storage_path")
    .maybeSingle()

  if (error) {
    console.error("[generador historial DELETE]", error)
    return NextResponse.json({ error: "No se pudo borrar" }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: "No existe" }, { status: 404 })

  if (data.storage_path) {
    const { error: errStorage } = await supabase.storage
      .from(BUCKET_GENERADOR)
      .remove([data.storage_path as string, rutaMiniatura(data.storage_path as string)])
    if (errStorage) console.error("[generador historial storage]", errStorage)
  }

  return NextResponse.json({ ok: true })
})
