import { NextResponse } from "next/server"

import { ruta } from "@/lib/admin/ruta"
import { exigirAlgunModulo } from "@/lib/guard-api"
import { MODULOS } from "@/lib/permisos"
import { supabase } from "@/lib/supabase"
import { COLORES, LIMITES } from "@/lib/tickets"
import { COLUMNAS_PROYECTO, aProyecto, recortar } from "@/lib/tickets-server"

const PERMISO = [...MODULOS]

/* ── POST · proyecto nuevo ────────────────────────────────────────────────── */

/**
 * Crear un proyecto es escribir un nombre y nada más.
 *
 * El color no se elige: se asigna el primero que no esté en uso. Un selector de
 * color sería una decisión más en un formulario que tiene que costar cinco
 * segundos, y el color acá no significa nada — sólo sirve para distinguir un
 * chip de otro de un vistazo.
 */
export const POST = ruta("proyectos POST", async (req: Request) => {
  const sinPermiso = await exigirAlgunModulo(PERMISO)
  if (sinPermiso) return sinPermiso

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }
  const raw = (body ?? {}) as Record<string, unknown>

  const nombre = recortar(raw.nombre, LIMITES.proyecto)
  if (!nombre) return NextResponse.json({ error: "Falta el nombre" }, { status: 400 })

  const { data: existentes } = await supabase.from("ticket_proyectos").select("nombre, color")

  // El índice único de la base también lo impediría, pero el error de Postgres
  // llega como un 500 ilegible. Acá se contesta lo que pasó de verdad.
  if ((existentes ?? []).some((p) => String(p.nombre).trim().toLowerCase() === nombre.toLowerCase())) {
    return NextResponse.json({ error: `Ya existe un proyecto “${nombre}”` }, { status: 409 })
  }

  const usados = new Set((existentes ?? []).map((p) => Number(p.color)))
  const libre = COLORES.findIndex((_, i) => !usados.has(i))

  const { data, error } = await supabase
    .from("ticket_proyectos")
    // Con la paleta agotada se vuelve a empezar por el principio: dos chips del
    // mismo color se distinguen por el nombre, que es lo que se lee igual.
    .insert({ nombre, color: libre === -1 ? (existentes?.length ?? 0) % COLORES.length : libre })
    .select(COLUMNAS_PROYECTO)
    .single()

  if (error || !data) {
    console.error("[proyectos POST]", error)
    return NextResponse.json({ error: "No se pudo crear el proyecto" }, { status: 500 })
  }

  return NextResponse.json({ proyecto: aProyecto(data) }, { status: 201 })
})
