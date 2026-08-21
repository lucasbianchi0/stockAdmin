import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { proximaPublicacion } from "@/lib/banco-context"
import { aPiezasBanco, columnasPieza, fechasOcupadas } from "@/lib/banco-server"
import { esFechaISO, hoyISO } from "@/lib/calendario-context"

/**
 * Programar una pieza del banco: del banco al calendario.
 *
 * No copia ni mueve nada: le pone fecha a la fila que ya existe. La imagen, el
 * copy editado y el titular impreso son literalmente los mismos objetos que se
 * revisaron, así que lo que se publica es lo que se aprobó — sin una
 * sincronización en el medio que un día se desincronice.
 *
 * GET propone la fecha; POST la confirma. Están separados porque proponer no
 * escribe: la pantalla puede mostrar "va al martes 26" antes de que el usuario
 * decida, y si la cambia a mano, manda la suya.
 */

/* ── GET · qué fecha le tocaría ───────────────────────────────────────────── */

export async function GET() {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const ocupadas = await fechasOcupadas()
  return NextResponse.json({ fecha: proximaPublicacion(ocupadas, hoyISO()) })
}

/* ── POST · programarla ───────────────────────────────────────────────────── */

export async function POST(req: Request) {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }

  const raw = (body ?? {}) as Record<string, unknown>
  const piezaId = typeof raw.piezaId === "string" ? raw.piezaId : null
  if (!piezaId) return NextResponse.json({ error: "Falta la pieza" }, { status: 400 })

  const { data: fila } = await supabase
    .from("content_slots")
    .select("id, origen, contenido, imagen_path")
    .eq("id", piezaId)
    .maybeSingle()

  if (!fila) return NextResponse.json({ error: "La pieza no existe" }, { status: 404 })
  if (fila.origen !== "banco") {
    return NextResponse.json({ error: "Esa pieza no es del banco" }, { status: 400 })
  }

  /*
   * Media pieza no se programa.
   *
   * Una fecha del calendario con un post sin imagen o sin copy es una fecha que
   * llega y no se puede publicar, y para entonces ya no hay tiempo de resolverla.
   * El chequeo va en el servidor y no solo en el botón: la pantalla puede estar
   * mostrando un estado viejo.
   */
  const contenido = (fila.contenido ?? null) as { caption?: string } | null
  if (!contenido?.caption?.trim()) {
    return NextResponse.json({ error: "La pieza todavía no tiene copy" }, { status: 400 })
  }
  if (!fila.imagen_path) {
    return NextResponse.json({ error: "La pieza todavía no tiene imagen" }, { status: 400 })
  }

  // La fecha que mandó el usuario manda; si no mandó, la que propone la cadencia.
  const fecha = esFechaISO(raw.fecha)
    ? raw.fecha
    : proximaPublicacion(await fechasOcupadas(), hoyISO())

  const { data, error } = await supabase
    .from("content_slots")
    .update({
      programada: fecha,
      programada_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", piezaId)
    .select(columnasPieza)
    .single()

  if (error || !data) {
    console.error("[banco/exportar]", error)
    return NextResponse.json({ error: "No se pudo programar la pieza" }, { status: 500 })
  }

  const [pieza] = await aPiezasBanco([data])
  return NextResponse.json({ pieza })
}

/* ── PATCH · devolverla al banco o moverla de día ─────────────────────────── */

/**
 * Cambia la fecha de una pieza ya programada, o la devuelve al banco con
 * `fecha: null`.
 *
 * Es lo que hace que el calendario sea editable y no una lista de decisiones
 * irreversibles: una pieza que ya no aplica esta semana vuelve al banco entera
 * —con su imagen y su copy— en vez de tener que regenerarse.
 */
export async function PATCH(req: Request) {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }

  const raw = (body ?? {}) as Record<string, unknown>
  const piezaId = typeof raw.piezaId === "string" ? raw.piezaId : null
  if (!piezaId) return NextResponse.json({ error: "Falta la pieza" }, { status: 400 })

  if (!("fecha" in raw)) return NextResponse.json({ error: "Mandá 'fecha'" }, { status: 400 })
  const fecha = raw.fecha === null ? null : esFechaISO(raw.fecha) ? raw.fecha : undefined
  if (fecha === undefined) return NextResponse.json({ error: "Fecha inválida" }, { status: 400 })

  const { data, error } = await supabase
    .from("content_slots")
    .update({
      programada: fecha,
      programada_at: fecha ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", piezaId)
    .eq("origen", "banco")
    .select(columnasPieza)
    .single()

  if (error || !data) {
    console.error("[banco/exportar PATCH]", error)
    return NextResponse.json({ error: "No se pudo mover la pieza" }, { status: 500 })
  }

  const [pieza] = await aPiezasBanco([data])
  return NextResponse.json({ pieza })
}
