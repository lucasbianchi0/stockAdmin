import { NextResponse } from "next/server"

import { ruta } from "@/lib/admin/ruta"
import { sesionConModulo } from "@/lib/sesion-server"
import { supabase } from "@/lib/supabase"
import { esEstadoPropuesta } from "@/lib/agentes"
import { COLUMNAS_TRABAJO, aTrabajo, crearNotaDesdePropuesta } from "@/lib/agentes-server"

/**
 * Aprobar o descartar una propuesta de un agente: { propuestaId, estado }.
 *
 * Aprobar sólo hace algo de verdad en el blog: crea la nota como borrador y
 * deja su id en la propuesta, así un segundo clic no crea otra. En Ads, redes e
 * informe aprobar es anotar la decisión; aplicar el cambio sigue siendo de una
 * persona.
 */
export const PATCH = ruta("agentes PATCH", async (req, ctx: { params: Promise<{ id: string }> }) => {
  const s = await sesionConModulo(["marketing"])
  if ("respuesta" in s) return s.respuesta

  const { id } = await ctx.params
  const raw = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!raw || typeof raw.propuestaId !== "string" || !esEstadoPropuesta(raw.estado)) {
    return NextResponse.json({ error: "Falta la propuesta o el estado" }, { status: 400 })
  }

  const { data: fila, error } = await supabase.from("agentes_trabajos").select(COLUMNAS_TRABAJO).eq("id", id).maybeSingle()
  if (error) return NextResponse.json({ error: "No se pudo leer el trabajo" }, { status: 500 })
  const trabajo = fila ? aTrabajo(fila) : null
  if (!trabajo) return NextResponse.json({ error: "No existe" }, { status: 404 })

  const propuesta = trabajo.propuestas.find((p) => p.id === raw.propuestaId)
  if (!propuesta) return NextResponse.json({ error: "No existe esa propuesta" }, { status: 404 })

  const nombre = s.sesion.nombre

  propuesta.estado = raw.estado

  if (trabajo.clave === "agente-blog" && raw.estado === "aprobada" && !propuesta.notaId) {
    const nota = await crearNotaDesdePropuesta(propuesta, { id: s.sesion.id, nombre })
    if ("error" in nota) {
      console.error("[agentes PATCH] nota", nota.error)
      return NextResponse.json({ error: "No se pudo crear la nota" }, { status: 500 })
    }
    propuesta.notaId = nota.id
  }

  const { data: guardada, error: errorGuardar } = await supabase
    .from("agentes_trabajos")
    .update({ propuestas: trabajo.propuestas, revisado_por: nombre, revisado_en: new Date().toISOString() })
    .eq("id", id)
    .select(COLUMNAS_TRABAJO)
    .single()

  if (errorGuardar || !guardada) {
    console.error("[agentes PATCH]", errorGuardar)
    return NextResponse.json({ error: "No se pudo guardar" }, { status: 500 })
  }

  return NextResponse.json({ trabajo: aTrabajo(guardada) })
})
