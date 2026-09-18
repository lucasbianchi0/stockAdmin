import { NextResponse } from "next/server"

import { ruta } from "@/lib/admin/ruta"
import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { slugDe } from "@/lib/marketing/notas"
import {
  COLUMNAS_NOTA,
  aNota,
  borrarObjetos,
  filaDelCuerpo,
  leerNota,
  problemaDeImagen,
  problemaDeLaFila,
  publicadoEnDe,
  slugLibre,
  subirPortada,
} from "@/lib/marketing/notas-server"

type Ctx = { params: Promise<{ id: string }> }

/* ── GET · la ficha ───────────────────────────────────────────────────────── */

export const GET = ruta("nota GET", async (_req: Request, ctx: Ctx) => {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const { id } = await ctx.params
  const nota = await leerNota(id)
  if (!nota) return NextResponse.json({ error: "La nota ya no existe" }, { status: 404 })

  return NextResponse.json({ nota })
})

/* ── PATCH · editar ───────────────────────────────────────────────────────── */

/**
 * Reemplaza la ficha entera, como en eventos y popups. La portada tiene los
 * tres caminos de siempre: nueva, `quitar_portada`, o nada (queda la que
 * estaba). La vieja se borra recién cuando la fila ya apunta a la nueva.
 *
 * El slug sólo cambia si el editor manda uno distinto a propósito. Corregir el
 * título no mueve la dirección: en una nota eso importa más que en un evento,
 * porque la dirección ya está indexada y los links entrantes son el activo.
 */
export const PATCH = ruta("nota PATCH", async (req: Request, ctx: Ctx) => {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const { id } = await ctx.params

  let form: FormData
  let cuerpo: Record<string, unknown>
  try {
    form = await req.formData()
    cuerpo = JSON.parse(String(form.get("datos") ?? "{}"))
  } catch {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 })
  }

  const { data: actual } = await supabase
    .from("notas")
    .select("slug, portada_ruta, publicado_en")
    .eq("id", id)
    .maybeSingle()
  if (!actual) return NextResponse.json({ error: "La nota ya no existe" }, { status: 404 })

  const fila = filaDelCuerpo(cuerpo)
  const problema = problemaDeLaFila(fila)
  if (problema) return NextResponse.json({ error: problema }, { status: 400 })

  fila.publicado_en = publicadoEnDe(fila, (actual.publicado_en as string | null) ?? null)

  const slugPedido = slugDe(String(cuerpo.slug ?? ""))
  if (slugPedido && slugPedido !== actual.slug) {
    fila.slug = await slugLibre(slugPedido, id)
  }

  const rutaVieja = typeof actual.portada_ruta === "string" ? actual.portada_ruta : null
  let aBorrar: (string | null)[] = []

  const portada = form.get("portada")
  if (portada instanceof File && portada.size > 0) {
    const problemaImagen = problemaDeImagen(portada)
    if (problemaImagen) return NextResponse.json({ error: problemaImagen }, { status: 415 })
    const subida = await subirPortada(portada)
    if ("error" in subida) return NextResponse.json({ error: subida.error }, { status: 400 })
    fila.portada_ruta = subida.ruta
    fila.portada_ancho = subida.ancho
    fila.portada_alto = subida.alto
    aBorrar = [rutaVieja]
  } else if (form.get("quitar_portada") === "true") {
    fila.portada_ruta = null
    fila.portada_ancho = null
    fila.portada_alto = null
    aBorrar = [rutaVieja]
  }

  const { data, error } = await supabase.from("notas").update(fila).eq("id", id).select(COLUMNAS_NOTA).single()

  if (error || !data) {
    console.error("[nota PATCH]", error)
    if (typeof fila.portada_ruta === "string" && fila.portada_ruta !== rutaVieja) {
      await borrarObjetos([fila.portada_ruta])
    }
    return NextResponse.json({ error: "No se pudo guardar la nota" }, { status: 500 })
  }

  await borrarObjetos(aBorrar)

  return NextResponse.json({ nota: aNota(data) })
})

/* ── DELETE ───────────────────────────────────────────────────────────────── */

/**
 * Borrar una nota publicada deja un 404 en una dirección que puede estar
 * indexada y enlazada desde otras notas. Por eso la pantalla lo pregunta con
 * ese aviso: lo habitual es despublicarla, no borrarla.
 */
export const DELETE = ruta("nota DELETE", async (_req: Request, ctx: Ctx) => {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const { id } = await ctx.params

  const { data: actual } = await supabase.from("notas").select("portada_ruta").eq("id", id).maybeSingle()

  const { error } = await supabase.from("notas").delete().eq("id", id)
  if (error) {
    console.error("[nota DELETE]", error)
    return NextResponse.json({ error: "No se pudo borrar la nota" }, { status: 500 })
  }

  await borrarObjetos([actual?.portada_ruta as string | undefined])
  return NextResponse.json({ ok: true })
})
