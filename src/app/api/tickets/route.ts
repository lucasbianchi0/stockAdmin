import { NextResponse } from "next/server"

import { ruta } from "@/lib/admin/ruta"
import { exigirAlgunModulo } from "@/lib/guard-api"
import { MODULOS } from "@/lib/permisos"
import { supabase } from "@/lib/supabase"
import { createSupabaseServer } from "@/lib/supabase-server"
import { nombreDeUsuario } from "@/lib/usuario"
import { LIMITES, esEstado, type Yo } from "@/lib/tickets"
import {
  COLUMNAS_PROYECTO,
  COLUMNAS_TICKET,
  aProyecto,
  aTicket,
  contarImagenes,
  listarEquipo,
  ordenInicial,
  recortar,
  resolverAsignado,
  uuid,
} from "@/lib/tickets-server"

/**
 * La ticketera es de todos los que tienen algún módulo: es el tablero del
 * equipo, no de un área. Quien no tiene acceso a nada tampoco entra acá — el
 * middleware lo manda a /sin-acceso antes.
 */
const PERMISO = [...MODULOS]

/* ── GET · el tablero entero ──────────────────────────────────────────────── */

/**
 * Todo en una sola respuesta: tickets, proyectos, equipo y quién sos.
 *
 * Son decenas de filas de un par de líneas: el viaje completo pesa menos que la
 * fuente de la página. A cambio, filtrar por persona o por proyecto y abrir una
 * ficha son instantáneos y no disparan una segunda request — que es justo lo
 * que uno hace acá, abrir cuatro tarjetas seguidas para ver de qué iban.
 */
export const GET = ruta("tickets GET", async () => {
  const sinPermiso = await exigirAlgunModulo(PERMISO)
  if (sinPermiso) return sinPermiso

  const supabaseUsuario = await createSupabaseServer()
  const {
    data: { user },
  } = await supabaseUsuario.auth.getUser()

  const [tickets, proyectos, equipo, imagenes] = await Promise.all([
    supabase
      .from("tickets")
      .select(COLUMNAS_TICKET)
      // El segundo criterio importa: dos tickets con el mismo `orden` —posible
      // apenas se crean dos a la vez— quedarían en un orden que cambia entre
      // pedidos, y el tablero se reacomodaría solo al refrescar.
      .order("orden", { ascending: true })
      .order("created_at", { ascending: false }),
    supabase.from("ticket_proyectos").select(COLUMNAS_PROYECTO).order("nombre"),
    listarEquipo(),
    contarImagenes(),
  ])

  if (tickets.error || proyectos.error) {
    console.error("[tickets GET]", tickets.error ?? proyectos.error)
    return NextResponse.json({ error: "No se pudo cargar el tablero" }, { status: 500 })
  }

  const yo: Yo = { id: user?.id ?? null, nombre: nombreDeUsuario(user) }

  return NextResponse.json({
    tickets: (tickets.data ?? []).map((f) => aTicket(f, imagenes.get(String(f.id)) ?? 0)),
    proyectos: (proyectos.data ?? []).map(aProyecto),
    usuarios: equipo,
    yo,
  })
})

/* ── POST · ticket nuevo ──────────────────────────────────────────────────── */

export const POST = ruta("tickets POST", async (req: Request) => {
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

  const raw = body as Record<string, unknown>

  const titulo = recortar(raw.titulo, LIMITES.titulo)
  if (!titulo) return NextResponse.json({ error: "Falta el título" }, { status: 400 })

  const supabaseUsuario = await createSupabaseServer()
  const {
    data: { user },
  } = await supabaseUsuario.auth.getUser()

  const estado = esEstado(raw.estado) ? raw.estado : "backlog"
  const asignado = await resolverAsignado(raw.asignadoId)

  const { data, error } = await supabase
    .from("tickets")
    .insert({
      titulo,
      descripcion: recortar(raw.descripcion, LIMITES.descripcion) || null,
      estado,
      proyecto_id: uuid(raw.proyectoId),
      autor_id: user?.id ?? null,
      // El nombre se congela acá — ver el comentario de la migración.
      autor_nombre: nombreDeUsuario(user),
      asignado_id: asignado?.id ?? null,
      asignado_nombre: asignado?.nombre ?? null,
      orden: await ordenInicial(estado),
    })
    .select(COLUMNAS_TICKET)
    .single()

  if (error || !data) {
    console.error("[tickets POST]", error)
    return NextResponse.json({ error: "No se pudo crear el ticket" }, { status: 500 })
  }

  return NextResponse.json({ ticket: aTicket(data) }, { status: 201 })
})
