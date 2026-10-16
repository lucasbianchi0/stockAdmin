import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { ruta } from "@/lib/admin/ruta"
import { proyectarCambio, type Ejercicio } from "@/lib/admin/ejercicios"

/**
 * Los ejercicios contables, y mover la fecha en que empieza o cierra uno.
 *
 * El POST trabaja en dos tiempos: sin `confirmar` devuelve cómo quedarían los
 * ejercicios y cuántos asientos cambian de ejercicio, y con `confirmar` lo hace.
 * La pantalla siempre pide el primero antes del segundo: mover un límite
 * renumera asientos, y eso se tiene que ver antes de hacerlo.
 */

async function leer(): Promise<Ejercicio[]> {
  const { data, error } = await supabase
    .from("ejercicios_resumen")
    .select("id, nombre, inicio, fin, estado, asientos, en_curso")
    .order("inicio", { ascending: true })
  if (error) throw error
  return (data ?? []).map((e) => ({
    id: Number(e.id),
    nombre: e.nombre as string,
    inicio: e.inicio as string,
    fin: e.fin as string,
    estado: e.estado as Ejercicio["estado"],
    asientos: Number(e.asientos),
    enCurso: Boolean(e.en_curso),
  }))
}

async function contarAsientos(desde: string, hasta: string): Promise<number> {
  const { count, error } = await supabase
    .from("asientos")
    .select("id", { count: "exact", head: true })
    .gte("fecha", desde)
    .lte("fecha", hasta)
  if (error) throw error
  return count ?? 0
}

export const GET = ruta("ejercicios GET", async () => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso
  try {
    return NextResponse.json({ ejercicios: await leer() })
  } catch (error) {
    console.error("[ejercicios]", error)
    return NextResponse.json({ error: "No se pudieron cargar los ejercicios" }, { status: 500 })
  }
})

export const POST = ruta("ejercicios POST", async (req: Request) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso

  const cuerpo = (await req.json().catch(() => ({}))) as {
    id?: number
    campo?: "inicio" | "fin"
    fecha?: string
    confirmar?: boolean
  }
  if (!cuerpo.id || (cuerpo.campo !== "inicio" && cuerpo.campo !== "fin") || !/^\d{4}-\d{2}-\d{2}$/.test(cuerpo.fecha ?? "")) {
    return NextResponse.json({ error: "Faltan datos del cambio" }, { status: 400 })
  }

  try {
    const ejercicios = await leer()
    const proyeccion = proyectarCambio(ejercicios, cuerpo.id, cuerpo.campo, cuerpo.fecha!)
    if ("error" in proyeccion) {
      return NextResponse.json({ error: proyeccion.error }, { status: 400 })
    }

    if (!cuerpo.confirmar) {
      const mueven = proyeccion.tramoQueCambia
        ? await contarAsientos(proyeccion.tramoQueCambia.desde, proyeccion.tramoQueCambia.hasta)
        : 0
      return NextResponse.json({ ...proyeccion, mueven })
    }

    const { error } = await supabase.rpc(
      cuerpo.campo === "inicio" ? "ejercicio_cambiar_inicio" : "ejercicio_cambiar_fin",
      cuerpo.campo === "inicio"
        ? { p_id: cuerpo.id, p_inicio: cuerpo.fecha }
        : { p_id: cuerpo.id, p_fin: cuerpo.fecha }
    )
    if (error) {
      // Los rechazos de la base ya vienen en castellano y para la persona.
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ ejercicios: await leer() })
  } catch (error) {
    console.error("[ejercicios POST]", error)
    return NextResponse.json({ error: "No se pudo cambiar el ejercicio" }, { status: 500 })
  }
})
