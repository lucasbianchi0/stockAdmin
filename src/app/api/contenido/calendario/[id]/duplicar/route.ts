import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { createSupabaseServer } from "@/lib/supabase-server"
import { columnasResumen } from "@/lib/calendario-server"
import { aFecha, aISO, fechaFinDe, sumarDias } from "@/lib/calendario-context"

type Contexto = { params: Promise<{ id: string }> }

/**
 * Duplica un plan: las mismas ideas, en las fechas que siguen.
 *
 * Qué se copia y qué no es la decisión de fondo. Se copia la PLANIFICACIÓN —las
 * tres opciones de cada día, cuál estaba elegida, qué template le tocaba— y no
 * se copia lo GENERADO: ni los captions ni las imágenes.
 *
 * El motivo no es ahorrar espacio. Un caption dice "esta semana" y nombra la
 * fecha del posteo original; una imagen es un archivo que costó doce segundos y
 * pertenece a la pieza para la que se hizo. Arrastrarlos a un plan de dos
 * semanas después daría contenido que se ve correcto y está desfasado, que es la
 * peor forma de estar mal.
 *
 * El plan nuevo arranca como borrador y en los días siguientes al original: es
 * el caso para el que sirve duplicar —repetir un arco que funcionó— y deja las
 * dos cosas listas para editar antes de darlo por bueno.
 */
export async function POST(_req: Request, { params }: Contexto) {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const { id } = await params

  const { data: original, error } = await supabase
    .from("content_plans")
    .select(columnasResumen)
    .eq("id", id)
    .maybeSingle()

  if (error) {
    console.error("[calendario/:id/duplicar]", error)
    return NextResponse.json({ error: "No se pudo leer el plan" }, { status: 500 })
  }
  if (!original) return NextResponse.json({ error: "Ese plan no existe" }, { status: 404 })

  const dias = Number(original.dias) || 15
  const fechaInicioVieja = String(original.fecha_inicio)
  const fechaInicioNueva = sumarDias(fechaFinDe({ fechaInicio: fechaInicioVieja, dias }), 1)

  // El corrimiento en días, para mover cada slot lo mismo que se movió el plan.
  const corrimiento = Math.round(
    (aFecha(fechaInicioNueva).getTime() - aFecha(fechaInicioVieja).getTime()) / 86400000
  )

  const supabaseUsuario = await createSupabaseServer()
  const {
    data: { user },
  } = await supabaseUsuario.auth.getUser()

  const nombreViejo =
    (typeof original.nombre === "string" && original.nombre) || String(original.titulo)

  const { data: copia, error: errCopia } = await supabase
    .from("content_plans")
    .insert({
      titulo: original.titulo,
      nombre: `Copia de ${nombreViejo}`.slice(0, 120),
      arco: original.arco,
      analisis: original.analisis,
      estado: "borrador",
      fecha_inicio: fechaInicioNueva,
      dias,
      canales: original.canales,
      contexto: original.contexto,
      audiencia: original.audiencia,
      created_by: user?.id ?? null,
    })
    .select("id")
    .single()

  if (errCopia || !copia) {
    console.error("[calendario/:id/duplicar insert]", errCopia)
    return NextResponse.json({ error: "No se pudo duplicar el plan" }, { status: 500 })
  }

  const { data: slots } = await supabase
    .from("content_slots")
    .select("fecha, canal, beat, opciones, elegida, template_slug, orden")
    .eq("plan_id", id)
    .order("orden", { ascending: true })

  if (slots && slots.length > 0) {
    const filas = slots.map((s) => ({
      plan_id: copia.id,
      fecha: aISO(desplazar(String(s.fecha), corrimiento)),
      canal: s.canal,
      beat: s.beat,
      opciones: s.opciones,
      elegida: s.elegida,
      template_slug: s.template_slug,
      orden: s.orden,
    }))

    const { error: errSlots } = await supabase.from("content_slots").insert(filas)
    if (errSlots) {
      // Un plan vacío es peor que ninguno: se borra la cáscara y que reintente.
      await supabase.from("content_plans").delete().eq("id", copia.id)
      console.error("[calendario/:id/duplicar slots]", errSlots)
      return NextResponse.json({ error: "No se pudo duplicar el plan" }, { status: 500 })
    }
  }

  return NextResponse.json({ planId: String(copia.id) }, { status: 201 })
}

function desplazar(iso: string, dias: number): Date {
  const d = aFecha(iso)
  d.setUTCDate(d.getUTCDate() + dias)
  return d
}
