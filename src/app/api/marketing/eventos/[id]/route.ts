import { NextResponse } from "next/server"

import { ruta } from "@/lib/admin/ruta"
import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import {
  COLUMNAS_EVENTO,
  aEvento,
  borrarObjetos,
  filaDelCuerpo,
  leerEventoCompleto,
  leerMarcas,
  rutasDeFirmas,
  certificadoDe,
  problemaDeImagen,
  problemaDeLaFila,
  slugLibre,
  subirPortada,
} from "@/lib/marketing/eventos-server"
import { slugDe } from "@/lib/marketing/eventos"

type Ctx = { params: Promise<{ id: string }> }

/* ── GET · la ficha, sus asistentes y la biblioteca de marcas ─────────────── */

export const GET = ruta("evento GET", async (_req: Request, ctx: Ctx) => {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const { id } = await ctx.params
  const [completo, marcas] = await Promise.all([leerEventoCompleto(id), leerMarcas()])
  if (!completo) return NextResponse.json({ error: "El evento ya no existe" }, { status: 404 })

  return NextResponse.json({ ...completo, marcas })
})

/* ── PATCH · editar ───────────────────────────────────────────────────────── */

/**
 * Reemplaza la ficha entera, como en popups. La portada tiene los tres caminos
 * de siempre: nueva, `quitar_portada`, o nada (queda la que estaba). La vieja se
 * borra recién cuando la fila ya apunta a la nueva.
 *
 * El slug sólo cambia si el editor manda uno distinto a propósito. Corregir el
 * título no mueve la dirección: el link ya está compartido.
 */
export const PATCH = ruta("evento PATCH", async (req: Request, ctx: Ctx) => {
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
    .from("eventos")
    .select("slug, portada_ruta, certificado")
    .eq("id", id)
    .maybeSingle()
  if (!actual) return NextResponse.json({ error: "El evento ya no existe" }, { status: 404 })

  const fila = filaDelCuerpo(cuerpo)
  const problema = problemaDeLaFila(fila)
  if (problema) return NextResponse.json({ error: problema }, { status: 400 })

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

  const { data, error } = await supabase
    .from("eventos")
    .update(fila)
    .eq("id", id)
    .select(COLUMNAS_EVENTO)
    .single()

  if (error || !data) {
    console.error("[evento PATCH]", error)
    if (typeof fila.portada_ruta === "string" && fila.portada_ruta !== rutaVieja) {
      await borrarObjetos([fila.portada_ruta])
    }
    return NextResponse.json({ error: "No se pudo guardar el evento" }, { status: 500 })
  }

  // Las firmas que estaban y ya no están: se reemplazaron o se quitaron.
  const firmasNuevas = new Set(rutasDeFirmas(certificadoDe(fila.certificado)))
  const firmasViejas = rutasDeFirmas(certificadoDe(actual.certificado)).filter((r) => !firmasNuevas.has(r))
  await borrarObjetos([...aBorrar, ...firmasViejas])

  const { count } = await supabase
    .from("evento_asistentes")
    .select("id", { count: "exact", head: true })
    .eq("evento_id", id)

  return NextResponse.json({ evento: aEvento(data, count ?? 0) })
})

/* ── DELETE ───────────────────────────────────────────────────────────────── */

/**
 * Se lleva los asistentes (cascade) y con ellos la validez de sus certificados:
 * el código impreso deja de verificar. Por eso la pantalla lo pregunta con el
 * número de certificados emitidos a la vista, y lo habitual es despublicarlo.
 */
export const DELETE = ruta("evento DELETE", async (_req: Request, ctx: Ctx) => {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const { id } = await ctx.params

  const { data: actual } = await supabase.from("eventos").select("portada_ruta, certificado").eq("id", id).maybeSingle()

  const { error } = await supabase.from("eventos").delete().eq("id", id)
  if (error) {
    console.error("[evento DELETE]", error)
    return NextResponse.json({ error: "No se pudo borrar el evento" }, { status: 500 })
  }

  await borrarObjetos([
    actual?.portada_ruta as string | undefined,
    ...(actual ? rutasDeFirmas(certificadoDe(actual.certificado)) : []),
  ])
  return NextResponse.json({ ok: true })
})
