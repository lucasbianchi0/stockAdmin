import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { aSlotsCliente } from "@/lib/calendario-server"
import { secuenciaRecomendada } from "@/lib/secuencia"
import { TEMPLATES } from "@/lib/templates-pieza"
import { esCanal, type Canal } from "@/lib/calendario-context"

type Contexto = { params: Promise<{ id: string }> }

/* ── POST · recalcular qué template le toca a cada pieza ──────────────────── */

/**
 * El botón de reordenar.
 *
 * Recalcula la secuencia entera con otra semilla. Las piezas que ya tienen la
 * imagen generada quedan clavadas en su template y el resto se acomoda
 * alrededor: cambiarles el formato dejaría la miniatura del preview diciendo una
 * composición y el archivo mostrando otra, y la única forma de arreglarlo sería
 * volver a gastar la generación.
 */
export async function POST(req: Request, { params }: Contexto) {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const { id } = await params

  let semilla = 0
  try {
    const body = (await req.json()) as Record<string, unknown>
    // Se acota a un entero chico: la semilla viaja al generador y un float o un
    // número gigante lo dejarían devolviendo siempre lo mismo.
    if (typeof body?.semilla === "number" && Number.isFinite(body.semilla)) {
      semilla = Math.abs(Math.trunc(body.semilla)) % 100000
    }
  } catch {
    // Sin body es semilla 0, que es la propuesta original.
  }

  const { data: slots, error } = await supabase
    .from("content_slots")
    .select("id, fecha, canal, template_slug, imagen_path")
    .eq("plan_id", id)

  if (error) {
    console.error("[calendario/:id/secuencia GET slots]", error)
    return NextResponse.json({ error: "No se pudieron leer las piezas" }, { status: 500 })
  }
  if (!slots || slots.length === 0) {
    return NextResponse.json({ error: "Ese plan no tiene piezas" }, { status: 404 })
  }

  const paraSecuencia = slots.filter((s) => esCanal(s.canal)).map((s) => ({
    id: String(s.id),
    fecha: String(s.fecha),
    canal: s.canal as Canal,
    fijo: s.imagen_path ? (s.template_slug as string | null) : null,
  }))

  const asignacion = secuenciaRecomendada(paraSecuencia, TEMPLATES, { semilla })

  /**
   * Un UPDATE por template y no uno por slot.
   *
   * Con seis templates por canal son doce escrituras en vez de veintidós, y
   * sobre todo: nada de `upsert`, que al recibir filas parciales pisa con null
   * las columnas que no van en el objeto — se llevaría puestos los captions.
   */
  const porTemplate = new Map<string, string[]>()
  for (const [slotId, templateId] of asignacion) {
    const lista = porTemplate.get(templateId)
    if (lista) lista.push(slotId)
    else porTemplate.set(templateId, [slotId])
  }

  for (const [templateId, ids] of porTemplate) {
    const { error: errUpdate } = await supabase
      .from("content_slots")
      .update({ template_slug: templateId, updated_at: new Date().toISOString() })
      .in("id", ids)

    if (errUpdate) {
      console.error("[calendario/:id/secuencia UPDATE]", errUpdate)
      return NextResponse.json({ error: "No se pudo guardar la secuencia" }, { status: 500 })
    }
  }

  const { data: actualizados } = await supabase
    .from("content_slots")
    .select("*")
    .eq("plan_id", id)
    .order("fecha", { ascending: true })
    .order("orden", { ascending: true })

  return NextResponse.json({ slots: await aSlotsCliente(actualizados ?? []) })
}
