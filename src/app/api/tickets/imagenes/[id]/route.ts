import { NextResponse } from "next/server"

import { ruta } from "@/lib/admin/ruta"
import { exigirAlgunModulo } from "@/lib/guard-api"
import { MODULOS } from "@/lib/permisos"
import { supabase } from "@/lib/supabase"
import { BUCKET_TICKETS } from "@/lib/tickets-server"

type Ctx = { params: Promise<{ id: string }> }

/** Borra la imagen y su fila. Primero la fila: si falla el borrado en Storage
 *  queda un archivo suelto, que es molesto pero inofensivo — al revés quedaría
 *  una fila apuntando a la nada, que sí rompe la pantalla. */
export const DELETE = ruta("tickets imagenes DELETE", async (_req: Request, ctx: Ctx) => {
  const sinPermiso = await exigirAlgunModulo([...MODULOS])
  if (sinPermiso) return sinPermiso

  const { id } = await ctx.params

  const { data, error } = await supabase
    .from("ticket_imagenes")
    .delete()
    .eq("id", id)
    .select("ruta")
    .maybeSingle()

  if (error) {
    console.error("[tickets imagenes DELETE]", error)
    return NextResponse.json({ error: "No se pudo borrar la imagen" }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: "La imagen no existe" }, { status: 404 })

  const { error: errStorage } = await supabase.storage
    .from(BUCKET_TICKETS)
    .remove([data.ruta as string])

  if (errStorage) console.error("[tickets imagenes storage remove]", errStorage)

  return NextResponse.json({ ok: true })
})
