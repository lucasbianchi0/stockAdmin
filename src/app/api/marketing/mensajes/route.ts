import { NextResponse } from "next/server"

import { ruta } from "@/lib/admin/ruta"
import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { createSupabaseServer } from "@/lib/supabase-server"
import { nombreDeUsuario } from "@/lib/usuario"
import {
  LIMITES,
  esCanal,
  esCircunstancia,
  llevaAsunto,
  normalizarEtiquetas,
  type Yo,
} from "@/lib/marketing/mensajes"
import { COLUMNAS_MENSAJE, aMensaje } from "@/lib/marketing/mensajes-server"

/* ── GET · todas las plantillas ───────────────────────────────────────────── */

/**
 * Se devuelve la lista entera, con los cuerpos completos y sin paginar.
 *
 * Son decenas de filas de un par de KB: el viaje completo pesa menos que la
 * fuente de la página. A cambio, buscar y filtrar es instantáneo y abrir una
 * ficha no dispara una segunda request — que es justo lo que uno hace acá,
 * abrir cuatro para comparar cuál sirve.
 *
 * Si algún día son cientos, lo que cambia es esta función y nada más: la
 * pantalla ya filtra sobre lo que tiene en memoria.
 */
export const GET = ruta("mensajes GET", async () => {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const supabaseUsuario = await createSupabaseServer()
  const {
    data: { user },
  } = await supabaseUsuario.auth.getUser()

  const { data, error } = await supabase
    .from("mensajes_plantilla")
    .select(COLUMNAS_MENSAJE)
    .order("updated_at", { ascending: false })

  if (error) {
    console.error("[mensajes GET]", error)
    return NextResponse.json(
      { error: "No se pudieron cargar las plantillas" },
      { status: 500 }
    )
  }

  // El nombre viaja junto con la lista para que la pantalla pueda decir "vos" en
  // vez del nombre propio, y para precargar la firma del formulario.
  const yo: Yo = { id: user?.id ?? null, nombre: nombreDeUsuario(user) }

  return NextResponse.json({ mensajes: (data ?? []).map(aMensaje), yo })
})

/* ── POST · plantilla nueva ───────────────────────────────────────────────── */

export const POST = ruta("mensajes POST", async (req: Request) => {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }

  const raw = body as Record<string, unknown>

  const titulo = recortar(raw.titulo, LIMITES.titulo)
  if (!titulo) {
    return NextResponse.json({ error: "Falta el título" }, { status: 400 })
  }

  const cuerpo = recortar(raw.cuerpo, LIMITES.cuerpo)
  if (!cuerpo) {
    return NextResponse.json({ error: "Falta el mensaje" }, { status: 400 })
  }

  const canal = esCanal(raw.canal) ? raw.canal : "whatsapp"

  const supabaseUsuario = await createSupabaseServer()
  const {
    data: { user },
  } = await supabaseUsuario.auth.getUser()

  const { data, error } = await supabase
    .from("mensajes_plantilla")
    .insert({
      titulo,
      circunstancia: esCircunstancia(raw.circunstancia) ? raw.circunstancia : "otra",
      canal,
      // Sin canal de mail no hay asunto que mostrar, y guardarlo igual haría que
      // reapareciera solo si alguien vuelve a cambiar el canal más adelante.
      asunto: llevaAsunto(canal) ? recortar(raw.asunto, LIMITES.asunto) || null : null,
      cuerpo,
      cuando_usar: recortar(raw.cuandoUsar, LIMITES.cuandoUsar) || null,
      etiquetas: normalizarEtiquetas(raw.etiquetas),
      autor_id: user?.id ?? null,
      // El nombre se congela acá — ver el comentario de la migración.
      autor_nombre: nombreDeUsuario(user),
    })
    .select(COLUMNAS_MENSAJE)
    .single()

  if (error || !data) {
    console.error("[mensajes POST]", error)
    return NextResponse.json({ error: "No se pudo guardar la plantilla" }, { status: 500 })
  }

  return NextResponse.json({ mensaje: aMensaje(data) }, { status: 201 })
})

/** Texto limpio y con tope. Devuelve `""` para todo lo que no sea una cadena
 *  con contenido, así el llamador decide entre error y `null` en un solo lugar. */
function recortar(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : ""
}
