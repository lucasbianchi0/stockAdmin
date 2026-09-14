import { NextResponse } from "next/server"

import { ruta } from "@/lib/admin/ruta"
import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { createSupabaseServer } from "@/lib/supabase-server"
import { nombreDeUsuario } from "@/lib/usuario"
import {
  COLUMNAS_EVENTO,
  aEvento,
  borrarObjetos,
  filaDelCuerpo,
  problemaDeImagen,
  problemaDeLaFila,
  slugLibre,
  subirPortada,
} from "@/lib/marketing/eventos-server"

/* ── GET · todos los eventos ──────────────────────────────────────────────── */

/**
 * La lista entera con la cantidad de asistentes de cada uno. El conteo viaja
 * embebido (`evento_asistentes(count)`) para no hacer una consulta por fila.
 */
export const GET = ruta("eventos GET", async () => {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const { data, error } = await supabase
    .from("eventos")
    .select(`${COLUMNAS_EVENTO}, evento_asistentes(count)`)
    .order("inicio", { ascending: false })

  if (error) {
    console.error("[eventos GET]", error)
    return NextResponse.json({ error: "No se pudieron cargar los eventos" }, { status: 500 })
  }

  const eventos = (data ?? []).map((fila) => {
    const f = fila as Record<string, unknown>
    const conteo = Array.isArray(f.evento_asistentes) ? f.evento_asistentes[0] : null
    return aEvento(f, Number((conteo as { count?: number } | null)?.count) || 0)
  })

  return NextResponse.json({ eventos })
})

/* ── POST · evento nuevo ──────────────────────────────────────────────────── */

/**
 * `multipart/form-data` con dos partes: `datos` (el JSON del editor) y
 * `portada` (opcional). El JSON va entero en un campo porque la ficha tiene
 * listas y objetos anidados —oradores, el certificado— que en campos sueltos de
 * un form serían una convención inventada para cada uno.
 */
export const POST = ruta("eventos POST", async (req: Request) => {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  let form: FormData
  let cuerpo: Record<string, unknown>
  try {
    form = await req.formData()
    cuerpo = JSON.parse(String(form.get("datos") ?? "{}"))
  } catch {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 })
  }

  const fila = filaDelCuerpo(cuerpo)
  const problema = problemaDeLaFila(fila)
  if (problema) return NextResponse.json({ error: problema }, { status: 400 })

  fila.slug = await slugLibre(String(cuerpo.slug || fila.titulo))

  const portada = form.get("portada")
  if (portada instanceof File && portada.size > 0) {
    const problemaImagen = problemaDeImagen(portada)
    if (problemaImagen) return NextResponse.json({ error: problemaImagen }, { status: 415 })
    const subida = await subirPortada(portada)
    if ("error" in subida) return NextResponse.json({ error: subida.error }, { status: 400 })
    fila.portada_ruta = subida.ruta
    fila.portada_ancho = subida.ancho
    fila.portada_alto = subida.alto
  }

  const supabaseUsuario = await createSupabaseServer()
  const {
    data: { user },
  } = await supabaseUsuario.auth.getUser()
  fila.autor_id = user?.id ?? null
  fila.autor_nombre = nombreDeUsuario(user)

  const { data, error } = await supabase.from("eventos").insert(fila).select(COLUMNAS_EVENTO).single()

  if (error || !data) {
    console.error("[eventos POST]", error)
    await borrarObjetos([fila.portada_ruta as string | undefined])
    return NextResponse.json({ error: "No se pudo crear el evento" }, { status: 500 })
  }

  return NextResponse.json({ evento: aEvento(data) }, { status: 201 })
})
