import { NextResponse } from "next/server"

import { ruta } from "@/lib/admin/ruta"
import { exigirAlgunModulo } from "@/lib/guard-api"
import { MODULOS } from "@/lib/permisos"
import { supabase } from "@/lib/supabase"
import { COLORES, LIMITES } from "@/lib/tickets"
import { COLUMNAS_PROYECTO, aProyecto, recortar } from "@/lib/tickets-server"

type Ctx = { params: Promise<{ id: string }> }

const PERMISO = [...MODULOS]

/* ── PATCH · renombrar y recolorear ──────────────────────────────────────── */

/**
 * Editar un proyecto es cambiarle el nombre o el color, y nada más.
 *
 * El nombre se corrige seguido —se carga apurado y queda con una falta— y el
 * cambio se propaga solo a todos los tickets, porque el ticket guarda el id y
 * no el texto. Es la diferencia con el autor de un ticket, que sí va congelado:
 * ahí el nombre es un crédito y tiene que quedarse como estaba; acá es una
 * etiqueta y tiene que poder arreglarse.
 */
export const PATCH = ruta("proyectos PATCH", async (req: Request, ctx: Ctx) => {
  const sinPermiso = await exigirAlgunModulo(PERMISO)
  if (sinPermiso) return sinPermiso

  const { id } = await ctx.params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }
  const raw = (body ?? {}) as Record<string, unknown>

  const cambios: Record<string, unknown> = {}

  if ("nombre" in raw) {
    const nombre = recortar(raw.nombre, LIMITES.proyecto)
    if (!nombre) return NextResponse.json({ error: "Falta el nombre" }, { status: 400 })

    // El índice único de la base también lo impediría, pero el error de Postgres
    // llega como un 500 ilegible. Acá se contesta lo que pasó de verdad.
    const { data: otros } = await supabase
      .from("ticket_proyectos")
      .select("id, nombre")
      .neq("id", id)

    if ((otros ?? []).some((p) => String(p.nombre).trim().toLowerCase() === nombre.toLowerCase())) {
      return NextResponse.json({ error: `Ya existe un proyecto “${nombre}”` }, { status: 409 })
    }

    cambios.nombre = nombre
  }

  if ("color" in raw) {
    const color = Number(raw.color)
    if (!Number.isInteger(color) || color < 0 || color >= COLORES.length) {
      return NextResponse.json({ error: "Color inválido" }, { status: 400 })
    }
    cambios.color = color
  }

  if (Object.keys(cambios).length === 0) {
    return NextResponse.json({ error: "Nada para cambiar" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("ticket_proyectos")
    .update(cambios)
    .eq("id", id)
    .select(COLUMNAS_PROYECTO)
    .single()

  if (error || !data) {
    console.error("[proyectos PATCH]", error)
    return NextResponse.json({ error: "No se pudo guardar el proyecto" }, { status: 500 })
  }

  return NextResponse.json({ proyecto: aProyecto(data) })
})

/* ── DELETE · borrar ─────────────────────────────────────────────────────── */

/**
 * Borrar un proyecto no borra sus tickets: la clave foránea es `on delete set
 * null` y quedan como tickets sueltos. Es lo que espera quien escribió mal un
 * nombre y quiere corregirlo — perder el trabajo del equipo por arreglar una
 * etiqueta sería indefendible.
 */
export const DELETE = ruta("proyectos DELETE", async (_req: Request, ctx: Ctx) => {
  const sinPermiso = await exigirAlgunModulo(PERMISO)
  if (sinPermiso) return sinPermiso

  const { id } = await ctx.params

  const { error } = await supabase.from("ticket_proyectos").delete().eq("id", id)

  if (error) {
    console.error("[proyectos DELETE]", error)
    return NextResponse.json({ error: "No se pudo borrar el proyecto" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
})
