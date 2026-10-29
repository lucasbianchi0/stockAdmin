import { NextResponse } from "next/server"

import { ruta } from "@/lib/admin/ruta"
import { exigirAlgunModulo } from "@/lib/guard-api"
import { MODULOS } from "@/lib/permisos"
import { supabase } from "@/lib/supabase"
import { createSupabaseServer } from "@/lib/supabase-server"
import { nombreDeUsuario } from "@/lib/usuario"
import { listarEquipo } from "@/lib/tickets-server"
import { esFecha, hoyArgentina, sumarDias, type Yo } from "@/lib/calendario-equipo"
import {
  COLUMNAS_CORRIDA,
  COLUMNAS_ENTRADA,
  aCorrida,
  aEntrada,
  normalizarEntrada,
} from "@/lib/calendario-equipo-server"

/**
 * El calendario es del equipo entero, como la ticketera: alcanza con tener
 * algún módulo. Cada uno ve lo de todos y filtra por su avatar.
 */
const PERMISO = [...MODULOS]

/** Lo más largo que se pide de una vez: una vista de mes con sus bordes. */
const MAX_DIAS = 62

/* ── GET · el rango que se está mirando ───────────────────────────────────── */

/**
 * Todas las entradas —son decenas, y la repetición se despliega en la
 * pantalla— y las corridas del rango.
 *
 * Las corridas arrancan dos semanas antes de hoy aunque se mire el mes que
 * viene: el panel de procesos muestra la última de cada uno, y sin eso se
 * quedaría vacío al adelantar el calendario.
 */
export const GET = ruta("calendario GET", async (req: Request) => {
  const sinPermiso = await exigirAlgunModulo(PERMISO)
  if (sinPermiso) return sinPermiso

  const url = new URL(req.url)
  const hoy = hoyArgentina()
  const desde = esFecha(url.searchParams.get("desde")) ? url.searchParams.get("desde")! : hoy
  let hasta = esFecha(url.searchParams.get("hasta")) ? url.searchParams.get("hasta")! : sumarDias(desde, 41)
  if (hasta < desde) hasta = desde
  if (hasta > sumarDias(desde, MAX_DIAS)) hasta = sumarDias(desde, MAX_DIAS)

  const desdeCorridas = sumarDias(desde < hoy ? desde : hoy, -14)

  const supabaseUsuario = await createSupabaseServer()
  const {
    data: { user },
  } = await supabaseUsuario.auth.getUser()

  const [entradas, corridas, equipo] = await Promise.all([
    supabase.from("calendario_entradas").select(COLUMNAS_ENTRADA).order("fecha"),
    supabase
      .from("calendario_corridas")
      .select(COLUMNAS_CORRIDA)
      // Un día de margen en cada punta: el día de Argentina no coincide con el
      // de UTC, y la corrida de las 22 h del último día quedaría afuera.
      .gte("inicio", `${sumarDias(desdeCorridas, -1)}T00:00:00Z`)
      .lte("inicio", `${sumarDias(hasta, 1)}T23:59:59Z`)
      .order("inicio", { ascending: false })
      .limit(2000),
    listarEquipo(),
  ])

  if (entradas.error || corridas.error) {
    console.error("[calendario GET]", entradas.error ?? corridas.error)
    return NextResponse.json({ error: "No se pudo cargar el calendario" }, { status: 500 })
  }

  const yo: Yo = { id: user?.id ?? null, nombre: nombreDeUsuario(user) }

  return NextResponse.json({
    entradas: (entradas.data ?? []).map(aEntrada),
    corridas: (corridas.data ?? []).map(aCorrida),
    usuarios: equipo,
    yo,
  })
})

/* ── POST · entrada nueva ─────────────────────────────────────────────────── */

export const POST = ruta("calendario POST", async (req: Request) => {
  const sinPermiso = await exigirAlgunModulo(PERMISO)
  if (sinPermiso) return sinPermiso

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }

  const r = await normalizarEntrada(body as Record<string, unknown>)
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 })

  const supabaseUsuario = await createSupabaseServer()
  const {
    data: { user },
  } = await supabaseUsuario.auth.getUser()

  const { data, error } = await supabase
    .from("calendario_entradas")
    .insert({ ...r.fila, autor_id: user?.id ?? null, autor_nombre: nombreDeUsuario(user) })
    .select(COLUMNAS_ENTRADA)
    .single()

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Ya hay otra entrada con esa clave." }, { status: 409 })
    }
    console.error("[calendario POST]", error)
    return NextResponse.json({ error: "No se pudo guardar" }, { status: 500 })
  }

  return NextResponse.json({ entrada: aEntrada(data) }, { status: 201 })
})
