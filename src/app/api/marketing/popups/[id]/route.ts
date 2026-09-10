import { NextResponse } from "next/server"

import { ruta } from "@/lib/admin/ruta"
import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { IMAGEN_TAMANO_MAX, problemaDeImagen } from "@/lib/marketing/popups"
import {
  COLUMNAS_POPUP,
  aPopup,
  borrarImagen,
  filaDelForm,
  problemaDeLaFila,
  subirImagen,
} from "@/lib/marketing/popups-server"

type Ctx = { params: Promise<{ id: string }> }

/* ── PATCH · editar, con o sin imagen nueva ───────────────────────────────── */

/**
 * Edita cualquiera del equipo de marketing, no sólo quien lo creó. Mismo
 * criterio que brochures y plantillas: esto es lo que está publicado en el
 * sitio, no la carpeta de cada uno. Si el popup del evento tiene mal la fecha,
 * el que lo detecta tiene que poder corregirlo hoy.
 *
 * El formulario manda todos los campos siempre, así que esto reemplaza la fila
 * entera. Es a propósito: con actualización parcial, un campo que el formulario
 * deja de mandar por un bug queda con el valor viejo para siempre y nadie
 * entiende por qué el popup dice algo que ya nadie escribió.
 *
 * La imagen es lo único que no se reemplaza sola. Tiene tres caminos:
 *
 *   · llega una nueva  → se sube, se guarda, y recién ahí se borra la vieja;
 *   · `quitar_imagen`  → se saca de la fila y se borra del bucket;
 *   · no llega nada    → queda la que estaba. Corregirle una coma al título no
 *                        puede obligar a volver a elegir la misma imagen.
 *
 * El objeto viejo se borra DESPUES de que la fila quedó guardada apuntando al
 * nuevo. Al revés, un error del update dejaría la fila apuntando a un objeto que
 * ya no existe: el popup se publica con la imagen rota por haber intentado
 * actualizarlo.
 */
export const PATCH = ruta("popups PATCH", async (req: Request, ctx: Ctx) => {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const { id } = await ctx.params

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 })
  }

  // La ruta actual hace falta para saber qué borrar, y de paso distingue "no
  // existe" de "no se pudo guardar".
  const { data: actual } = await supabase
    .from("popups")
    .select("imagen_ruta")
    .eq("id", id)
    .maybeSingle()

  if (!actual) {
    return NextResponse.json({ error: "El popup ya no existe" }, { status: 404 })
  }

  const rutaVieja = typeof actual.imagen_ruta === "string" ? actual.imagen_ruta : ""

  const fila = filaDelForm(form)
  const problema = problemaDeLaFila(fila)
  if (problema) return NextResponse.json({ error: problema }, { status: 400 })

  /** Lo que hay que borrar del bucket si el update sale bien. */
  let aBorrar: string[] = []

  const imagen = form.get("imagen")
  if (imagen instanceof File && imagen.size > 0) {
    const problemaImagen = problemaDeImagen(imagen)
    if (problemaImagen) {
      return NextResponse.json(
        { error: problemaImagen },
        { status: imagen.size > IMAGEN_TAMANO_MAX ? 413 : 415 }
      )
    }

    const subida = await subirImagen(imagen)
    if ("error" in subida) return NextResponse.json({ error: subida.error }, { status: 400 })

    fila.imagen_ruta = subida.ruta
    fila.imagen_ancho = subida.ancho
    fila.imagen_alto = subida.alto
    aBorrar = [rutaVieja]
  } else if (form.get("quitar_imagen") === "true") {
    fila.imagen_ruta = null
    fila.imagen_ancho = null
    fila.imagen_alto = null
    aBorrar = [rutaVieja]
  }

  const { data, error } = await supabase
    .from("popups")
    .update(fila)
    .eq("id", id)
    .select(COLUMNAS_POPUP)
    .single()

  if (error || !data) {
    console.error("[popups PATCH]", error)
    // La imagen nueva quedó huérfana: se limpia acá, que es el único momento en
    // que todavía se sabe cuál era.
    if (typeof fila.imagen_ruta === "string" && fila.imagen_ruta !== rutaVieja) {
      await borrarImagen([fila.imagen_ruta])
    }
    return NextResponse.json({ error: "No se pudo guardar el popup" }, { status: 500 })
  }

  await borrarImagen(aBorrar)

  return NextResponse.json({ popup: aPopup(data) })
})

/* ── DELETE · borrar ──────────────────────────────────────────────────────── */

/**
 * Borrar es para el popup que nunca se publicó o que ya no sirve de referencia.
 * Lo habitual es apagarlo: el del evento de este año es el borrador del año que
 * viene, y la pantalla lo dice en el diálogo de confirmación.
 *
 * La imagen se borra después de la fila, por lo mismo de siempre: si el delete
 * falla queda la fila con su imagen, no una fila apuntando al vacío.
 */
export const DELETE = ruta("popups DELETE", async (_req: Request, ctx: Ctx) => {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const { id } = await ctx.params

  const { data: actual } = await supabase
    .from("popups")
    .select("imagen_ruta")
    .eq("id", id)
    .maybeSingle()

  const { error } = await supabase.from("popups").delete().eq("id", id)

  if (error) {
    console.error("[popups DELETE]", error)
    return NextResponse.json({ error: "No se pudo borrar el popup" }, { status: 500 })
  }

  if (actual && typeof actual.imagen_ruta === "string") {
    await borrarImagen([actual.imagen_ruta])
  }

  return NextResponse.json({ ok: true })
})
