import { NextResponse } from "next/server"

import { ruta } from "@/lib/admin/ruta"
import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { createSupabaseServer } from "@/lib/supabase-server"
import { nombreDeUsuario } from "@/lib/usuario"
import {
  COLUMNAS_NOTA,
  aNota,
  borrarObjetos,
  filaDelCuerpo,
  leerNotas,
  problemaDeImagen,
  problemaDeLaFila,
  publicadoEnDe,
  slugLibre,
  subirPortada,
} from "@/lib/marketing/notas-server"

/* ── GET · todas las notas ────────────────────────────────────────────────── */

export const GET = ruta("notas GET", async () => {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  return NextResponse.json({ notas: await leerNotas() })
})

/* ── POST · nota nueva ────────────────────────────────────────────────────── */

/**
 * `multipart/form-data` con dos partes: `datos` (el JSON del editor) y
 * `portada` (opcional). El JSON va entero en un campo porque la nota tiene
 * listas anidadas —FAQs, fuentes— que en campos sueltos de un form serían una
 * convención inventada para cada una.
 */
export const POST = ruta("notas POST", async (req: Request) => {
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
  fila.publicado_en = publicadoEnDe(fila, null)

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

  const { data, error } = await supabase.from("notas").insert(fila).select(COLUMNAS_NOTA).single()

  if (error || !data) {
    console.error("[notas POST]", error)
    await borrarObjetos([fila.portada_ruta as string | undefined])
    return NextResponse.json({ error: "No se pudo crear la nota" }, { status: 500 })
  }

  return NextResponse.json({ nota: aNota(data) }, { status: 201 })
})
