import { NextResponse } from "next/server"

import { ruta } from "@/lib/admin/ruta"
import { exigirAlgunModulo } from "@/lib/guard-api"
import { MODULOS } from "@/lib/permisos"
import { supabase } from "@/lib/supabase"
import { uuid } from "@/lib/tickets-server"
import { COLUMNAS_ENTRADA, aEntrada, normalizarEntrada } from "@/lib/calendario-equipo-server"

type Ctx = { params: Promise<{ id: string }> }

const PERMISO = [...MODULOS]

/* ── PATCH · editar ───────────────────────────────────────────────────────── */

/**
 * Edita cualquiera, como en la ticketera: si la hora de la reunión está mal, el
 * que lo nota la corrige. Va la entrada entera —es un formulario de una sola
 * pantalla— y se valida igual que un alta.
 */
export const PATCH = ruta("calendario PATCH", async (req: Request, ctx: Ctx) => {
  const sinPermiso = await exigirAlgunModulo(PERMISO)
  if (sinPermiso) return sinPermiso

  const id = uuid((await ctx.params).id)
  if (!id) return NextResponse.json({ error: "No existe" }, { status: 404 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }

  const r = await normalizarEntrada((body ?? {}) as Record<string, unknown>)
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 })

  const { data, error } = await supabase
    .from("calendario_entradas")
    .update(r.fila)
    .eq("id", id)
    .select(COLUMNAS_ENTRADA)
    .maybeSingle()

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Ya hay otra entrada con esa clave." }, { status: 409 })
    }
    console.error("[calendario PATCH]", error)
    return NextResponse.json({ error: "No se pudo guardar" }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: "No existe" }, { status: 404 })

  return NextResponse.json({ entrada: aEntrada(data) })
})

/* ── DELETE ───────────────────────────────────────────────────────────────── */

/** Las corridas quedan: son lo que pasó, y si la entrada vuelve con la misma
 *  clave, su historia vuelve con ella. */
export const DELETE = ruta("calendario DELETE", async (_req: Request, ctx: Ctx) => {
  const sinPermiso = await exigirAlgunModulo(PERMISO)
  if (sinPermiso) return sinPermiso

  const id = uuid((await ctx.params).id)
  if (!id) return NextResponse.json({ error: "No existe" }, { status: 404 })

  const { error } = await supabase.from("calendario_entradas").delete().eq("id", id)
  if (error) {
    console.error("[calendario DELETE]", error)
    return NextResponse.json({ error: "No se pudo borrar" }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
})
