import { NextResponse } from "next/server"

import { ruta } from "@/lib/admin/ruta"
import { exigirAlgunModulo } from "@/lib/guard-api"
import { MODULOS } from "@/lib/permisos"
import { supabase } from "@/lib/supabase"
import { esEstado } from "@/lib/tickets"

const PERMISO = [...MODULOS]

/**
 * Soltar una tarjeta.
 *
 * El cliente no manda "moví el ticket X a la posición 3": manda **la columna de
 * destino entera, ya ordenada**. Es más texto en el body y muchísimo menos
 * lógica en los dos lados — el servidor no tiene que recalcular índices ni
 * adivinar qué se corrió, y el resultado en la base es exactamente lo que la
 * persona ve en pantalla.
 *
 * Cuando el ticket cambia de columna llegan dos llamadas, una por columna: la
 * de origen se reordena para cerrar el hueco. Podrían ser una sola, pero serían
 * dos formas de mandar lo mismo según el caso.
 */
export const POST = ruta("tickets mover", async (req: Request) => {
  const sinPermiso = await exigirAlgunModulo(PERMISO)
  if (sinPermiso) return sinPermiso

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }
  const raw = (body ?? {}) as Record<string, unknown>

  if (!esEstado(raw.estado)) {
    return NextResponse.json({ error: "Columna inválida" }, { status: 400 })
  }

  const ids = Array.isArray(raw.ids)
    ? raw.ids.filter((v): v is string => typeof v === "string")
    : []

  // Una columna que quedó vacía no tiene nada que reordenar, y no es un error.
  if (ids.length === 0) return NextResponse.json({ ok: true })

  const { error } = await supabase.rpc("tickets_reordenar", {
    p_estado: raw.estado,
    p_ids: ids,
  })

  if (error) {
    console.error("[tickets mover]", error)
    return NextResponse.json({ error: "No se pudo mover el ticket" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
})
