import { NextResponse } from "next/server"

import { ruta } from "@/lib/admin/ruta"
import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { createSupabaseServer } from "@/lib/supabase-server"
import { nombreDeUsuario } from "@/lib/usuario"
import { IMAGEN_TAMANO_MAX, problemaDeImagen } from "@/lib/marketing/popups"
import {
  COLUMNAS_POPUP,
  aPopup,
  borrarImagen,
  filaDelForm,
  problemaDeLaFila,
  subirImagen,
} from "@/lib/marketing/popups-server"

/* ── GET · todos los popups ───────────────────────────────────────────────── */

/**
 * La lista entera, sin paginar. Son unidades de decenas de filas de texto corto
 * en el peor de los casos, y a cambio la pantalla filtra y ordena sin volver al
 * servidor. Las imágenes no viajan acá: sólo su URL.
 *
 * El orden es el mismo que usa el sitio para elegir cuál mostrar —lo último que
 * se tocó primero—, así el que está arriba de la lista es el que está al aire.
 */
export const GET = ruta("popups GET", async () => {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const { data, error } = await supabase
    .from("popups")
    .select(COLUMNAS_POPUP)
    .order("updated_at", { ascending: false })

  if (error) {
    console.error("[popups GET]", error)
    return NextResponse.json({ error: "No se pudieron cargar los popups" }, { status: 500 })
  }

  return NextResponse.json({ popups: (data ?? []).map(aPopup) })
})

/* ── POST · popup nuevo ───────────────────────────────────────────────────── */

/**
 * Llega como `multipart/form-data`: la imagen y los datos en el mismo pedido.
 *
 * El orden importa. Primero se valida todo lo barato —permiso, campos—, después
 * se procesa y sube la imagen, y recién al final se inserta la fila. Si el
 * insert falla, el objeto recién subido se borra: una imagen en el bucket sin
 * fila que la apunte es basura que nadie va a encontrar nunca para limpiar.
 */
export const POST = ruta("popups POST", async (req: Request) => {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 })
  }

  const fila = filaDelForm(form)
  const problema = problemaDeLaFila(fila)
  if (problema) return NextResponse.json({ error: problema }, { status: 400 })

  const imagen = form.get("imagen")
  if (imagen instanceof File && imagen.size > 0) {
    const problemaImagen = problemaDeImagen(imagen)
    if (problemaImagen) {
      // 413 para el peso y 415 para el tipo: son dos arreglos distintos del lado
      // de quien sube.
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
  }

  const supabaseUsuario = await createSupabaseServer()
  const {
    data: { user },
  } = await supabaseUsuario.auth.getUser()

  fila.autor_id = user?.id ?? null
  // El nombre se congela acá — ver el comentario de la migración.
  fila.autor_nombre = nombreDeUsuario(user)

  const { data, error } = await supabase
    .from("popups")
    .insert(fila)
    .select(COLUMNAS_POPUP)
    .single()

  if (error || !data) {
    console.error("[popups POST]", error)
    if (typeof fila.imagen_ruta === "string") await borrarImagen([fila.imagen_ruta])
    return NextResponse.json({ error: "No se pudo crear el popup" }, { status: 500 })
  }

  return NextResponse.json({ popup: aPopup(data) }, { status: 201 })
})
