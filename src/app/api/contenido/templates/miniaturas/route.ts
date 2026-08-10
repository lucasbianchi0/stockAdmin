import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { firmar } from "@/lib/calendario-server"

/**
 * Una miniatura por template: la última pieza que se generó con él.
 *
 * Es lo que hace posible ver el feed antes de generarlo. Con el template
 * asignado a cada slot y una muestra de cómo se ve cada template, la grilla se
 * puede dibujar entera sin una sola llamada al generador — y recién si el
 * conjunto convence se gastan las veinte generaciones de doce segundos.
 *
 * Sale de `piezas_generadas`, que es el historial del probador. Un template que
 * nunca se probó no tiene miniatura y la celda cae al cartel con el nombre: es
 * información peor, pero es información, y no rompe la grilla.
 */

/** Techo del barrido. Con 19 templates y varias tandas guardadas alcanza y sobra
 *  para encontrar la última de cada uno sin traerse el historial completo. */
const LIMITE = 400

export async function GET() {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const { data, error } = await supabase
    .from("piezas_generadas")
    .select("template_id, storage_path, created_at")
    .order("created_at", { ascending: false })
    .limit(LIMITE)

  if (error) {
    console.error("[templates/miniaturas]", error)
    // Sin miniaturas el preview se dibuja igual, con los nombres. Devolver 500
    // haría que un historial vacío rompa la pantalla que venía a ayudar.
    return NextResponse.json({ miniaturas: {} })
  }

  // Vienen de la más nueva a la más vieja, así que la primera de cada template
  // es la última generada.
  const rutaPorTemplate = new Map<string, string>()
  for (const fila of data ?? []) {
    const id = String(fila.template_id)
    const ruta = typeof fila.storage_path === "string" ? fila.storage_path : null
    if (ruta && !rutaPorTemplate.has(id)) rutaPorTemplate.set(id, ruta)
  }

  const ids = [...rutaPorTemplate.keys()]
  const urls = await firmar(ids.map((id) => rutaPorTemplate.get(id)!))

  const miniaturas: Record<string, string> = {}
  ids.forEach((id, i) => {
    const url = urls[i]
    if (url) miniaturas[id] = url
  })

  return NextResponse.json({ miniaturas })
}
