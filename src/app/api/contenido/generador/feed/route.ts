import { NextResponse } from "next/server"

import { ruta } from "@/lib/admin/ruta"
import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { firmar } from "@/lib/calendario-server"
import { aImagenes } from "@/lib/generador-server"

/**
 * Una muestra por template del feed, para la galería del generador.
 *
 * Es la última pieza real que salió con cada uno: primero las del generador
 * (son las que la persona hizo acá), y si no hay, las del banco. Un template sin
 * ninguna pieza todavía no tiene muestra y la galería dibuja su placeholder.
 */
export const GET = ruta("generador feed GET", async () => {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const muestras: Record<string, string> = {}

  const { data: propias } = await supabase
    .from("generador_historial")
    .select("*")
    .eq("tipo", "imagen")
    .eq("parametros->>operacion", "feed")
    .order("created_at", { ascending: false })
    .limit(120)

  const primeras = new Map<string, Record<string, unknown>>()
  for (const f of propias ?? []) {
    const id = String((f.parametros as Record<string, unknown>)?.template ?? "")
    if (id && !primeras.has(id)) primeras.set(id, f)
  }
  const imagenes = await aImagenes([...primeras.values()])
  for (const [id, fila] of primeras) {
    const img = imagenes.find((i) => i.id === fila.id)
    if (img?.miniatura) muestras[id] = img.miniatura
  }

  const { data: banco } = await supabase
    .from("content_slots")
    .select("template_slug, imagen_path")
    .not("imagen_path", "is", null)
    .not("template_slug", "is", null)
    .order("created_at", { ascending: false })
    .limit(300)

  const faltan = new Map<string, string>()
  for (const f of banco ?? []) {
    const id = String(f.template_slug)
    if (!muestras[id] && !faltan.has(id)) faltan.set(id, String(f.imagen_path))
  }
  const urls = await firmar([...faltan.values()])
  ;[...faltan.keys()].forEach((id, i) => {
    if (urls[i]) muestras[id] = urls[i]!
  })

  return NextResponse.json({ muestras })
})
