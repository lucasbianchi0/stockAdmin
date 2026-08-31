import { NextResponse } from "next/server"

import { ruta } from "@/lib/admin/ruta"
import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { createSupabaseServer } from "@/lib/supabase-server"
import { nombreDeUsuario } from "@/lib/usuario"
import {
  LIMITES,
  TAMANO_MAX,
  esSolucion,
  problemaDelArchivo,
} from "@/lib/marketing/brochures"
import {
  COLUMNAS_BROCHURE,
  borrarDelBucket,
  conUrls,
  subirPdf,
  textoDelForm,
} from "@/lib/marketing/brochures-server"

type Ctx = { params: Promise<{ id: string }> }

/* ── PATCH · editar, con o sin PDF nuevo ──────────────────────────────────── */

/**
 * Edita cualquiera, no solo quien lo subió.
 *
 * Es deliberado, y es lo mismo que hacen las plantillas de mensajes: esto es el
 * material del equipo, no la carpeta de cada uno. Si la propuesta para bancos
 * tiene un precio viejo, el que lo detecta tiene que poder reemplazar el PDF sin
 * esperar a que vuelva de vacaciones quien lo armó. Lo que se conserva es el
 * crédito —el autor no cambia nunca— y queda registrado quién fue el último en
 * tocarlo.
 *
 * REEMPLAZAR EL PDF ES LO MISMO QUE EDITARLO
 *
 * No hay un endpoint aparte para el archivo. El caso real es "actualicé el
 * brochure": cambia el PDF y a veces el título, y partirlo en dos pedidos abre
 * la ventana en la que el archivo ya es el nuevo y el título todavía es el
 * viejo.
 *
 * El PDF viejo se borra del bucket recién después de que la fila quedó guardada
 * apuntando al nuevo. Al revés —borrar primero— un error del update dejaría la
 * fila apuntando a un objeto que ya no existe: el brochure entero se vuelve
 * inaccesible por haber intentado actualizarlo.
 */
export const PATCH = ruta("brochures PATCH", async (req: Request, ctx: Ctx) => {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const { id } = await ctx.params

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 })
  }

  // Hace falta el autor para decidir si esta edición deja rastro de editor, y la
  // ruta actual para saber qué borrar si entra un PDF nuevo. De paso distingue
  // "no existe" de "no se pudo guardar".
  const { data: actual } = await supabase
    .from("brochures")
    .select("autor_id, archivo_ruta, version")
    .eq("id", id)
    .maybeSingle()

  if (!actual) {
    return NextResponse.json({ error: "El brochure ya no existe" }, { status: 404 })
  }

  const cambios: Record<string, unknown> = {}

  const titulo = textoDelForm(form, "titulo", LIMITES.titulo)
  if (titulo !== null) {
    if (!titulo) return NextResponse.json({ error: "Falta el título" }, { status: 400 })
    cambios.titulo = titulo
  }

  const solucion = form.get("solucion")
  if (esSolucion(solucion)) cambios.solucion = solucion

  /* ── El PDF nuevo, si lo hay ────────────────────────────────────────────── */

  const archivo = form.get("archivo")
  let rutaNueva: string | null = null

  if (archivo instanceof File && archivo.size > 0) {
    const problema = problemaDelArchivo(archivo)
    if (problema) {
      return NextResponse.json(
        { error: problema },
        { status: archivo.size > TAMANO_MAX ? 413 : 415 }
      )
    }

    const subida = await subirPdf(archivo)
    if ("error" in subida) {
      return NextResponse.json({ error: subida.error }, { status: 500 })
    }

    rutaNueva = subida.ruta
    cambios.archivo_ruta = subida.ruta
    cambios.archivo_nombre = archivo.name.slice(0, LIMITES.nombreArchivo)
    cambios.archivo_tamano = archivo.size
    // La versión la calcula el servidor y no el cliente: dos personas
    // reemplazando el mismo día no pueden terminar las dos en "v2".
    cambios.version = (Number(actual.version) || 1) + 1
  }

  if (Object.keys(cambios).length === 0) {
    return NextResponse.json({ error: "Nada para cambiar" }, { status: 400 })
  }

  const supabaseUsuario = await createSupabaseServer()
  const {
    data: { user },
  } = await supabaseUsuario.auth.getUser()

  // El autor editando lo suyo no es "editado por": el pie diría dos veces el
  // mismo nombre y dejaría de significar algo.
  cambios.editor_nombre =
    user && actual.autor_id === user.id ? null : nombreDeUsuario(user)

  const { data, error } = await supabase
    .from("brochures")
    .update(cambios)
    .eq("id", id)
    .select(COLUMNAS_BROCHURE)
    .single()

  if (error || !data) {
    // El PDF nuevo ya está arriba y la fila sigue apuntando al viejo: se limpia
    // el que quedó suelto.
    if (rutaNueva) await borrarDelBucket([rutaNueva])
    console.error("[brochures PATCH]", error)
    return NextResponse.json({ error: "No se pudo guardar" }, { status: 500 })
  }

  // Recién ahora, con la fila ya apuntando al PDF nuevo.
  if (rutaNueva && actual.archivo_ruta) {
    await borrarDelBucket([String(actual.archivo_ruta)])
  }

  const [brochure] = await conUrls([data])
  return NextResponse.json({ brochure })
})

/* ── DELETE · baja definitiva ─────────────────────────────────────────────── */

/**
 * Borra la fila y el PDF.
 *
 * En ese orden: si primero se borrara el archivo y el delete de la fila fallara,
 * quedaría un brochure en la lista que no se puede abrir —lo peor de los dos
 * mundos—. Al revés, lo peor que puede pasar es un PDF suelto en el bucket que
 * nadie ve.
 */
export const DELETE = ruta("brochures DELETE", async (_req: Request, ctx: Ctx) => {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const { id } = await ctx.params

  const { data: actual } = await supabase
    .from("brochures")
    .select("archivo_ruta")
    .eq("id", id)
    .maybeSingle()

  const { error } = await supabase.from("brochures").delete().eq("id", id)
  if (error) {
    console.error("[brochures DELETE]", error)
    return NextResponse.json({ error: "No se pudo borrar" }, { status: 500 })
  }

  if (actual?.archivo_ruta) await borrarDelBucket([String(actual.archivo_ruta)])

  return NextResponse.json({ ok: true })
})
