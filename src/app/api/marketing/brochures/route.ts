import { NextResponse } from "next/server"

import { ruta } from "@/lib/admin/ruta"
import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { createSupabaseServer } from "@/lib/supabase-server"
import { nombreDeUsuario } from "@/lib/usuario"
import {
  LIMITES,
  TAMANO_MAX,
  esIndustria,
  esSolucion,
  problemaDelArchivo,
  type Yo,
} from "@/lib/marketing/brochures"
import {
  COLUMNAS_BROCHURE,
  borrarDelBucket,
  conUrls,
  etiquetasDelForm,
  subirPdf,
  textoDelForm,
} from "@/lib/marketing/brochures-server"

/* ── GET · todos los brochures ────────────────────────────────────────────── */

/**
 * La lista entera, sin paginar y con las URL de los PDF ya firmadas.
 *
 * Son decenas de filas de texto corto: el viaje pesa menos que la fuente de la
 * página, y a cambio buscar y filtrar es instantáneo y abrir una ficha no
 * dispara una segunda request. Los PDF no viajan acá —solo su enlace firmado—,
 * así que el peso del material no entra en esta cuenta.
 */
export const GET = ruta("brochures GET", async () => {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const supabaseUsuario = await createSupabaseServer()
  const {
    data: { user },
  } = await supabaseUsuario.auth.getUser()

  const { data, error } = await supabase
    .from("brochures")
    .select(COLUMNAS_BROCHURE)
    .order("updated_at", { ascending: false })

  if (error) {
    console.error("[brochures GET]", error)
    return NextResponse.json(
      { error: "No se pudieron cargar los brochures" },
      { status: 500 }
    )
  }

  // El nombre viaja junto con la lista para que la pantalla pueda decir "vos" en
  // vez del nombre propio, y para precargar la firma del formulario.
  const yo: Yo = { id: user?.id ?? null, nombre: nombreDeUsuario(user) }

  return NextResponse.json({ brochures: await conUrls(data ?? []), yo })
})

/* ── POST · brochure nuevo ────────────────────────────────────────────────── */

/**
 * Llega como `multipart/form-data`: el PDF y los datos en el mismo pedido.
 *
 * El orden importa. Primero se valida todo lo barato —permiso, título,
 * archivo—, después se sube el PDF, y recién al final se inserta la fila. Si el
 * insert falla, el objeto recién subido se borra: un archivo en el bucket sin
 * fila que lo apunte es basura que nadie va a encontrar nunca para limpiar.
 */
export const POST = ruta("brochures POST", async (req: Request) => {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 })
  }

  const titulo = textoDelForm(form, "titulo", LIMITES.titulo)
  if (!titulo) {
    return NextResponse.json({ error: "Falta el título" }, { status: 400 })
  }

  const archivo = form.get("archivo")
  if (!(archivo instanceof File)) {
    return NextResponse.json({ error: "Elegí el PDF" }, { status: 400 })
  }

  const problema = problemaDelArchivo(archivo)
  if (problema) {
    // 413 para el peso y 415 para el tipo: son dos arreglos distintos del lado
    // de quien sube. El texto que ve la persona es el mismo en los dos casos —lo
    // arma `problemaDelArchivo`, así que el diálogo y el endpoint dicen igual.
    return NextResponse.json(
      { error: problema },
      { status: archivo.size > TAMANO_MAX ? 413 : 415 }
    )
  }

  const subida = await subirPdf(archivo)
  if ("error" in subida) {
    return NextResponse.json({ error: subida.error }, { status: 500 })
  }

  const supabaseUsuario = await createSupabaseServer()
  const {
    data: { user },
  } = await supabaseUsuario.auth.getUser()

  const solucion = form.get("solucion")
  const industria = form.get("industria")

  const { data, error } = await supabase
    .from("brochures")
    .insert({
      titulo,
      solucion: esSolucion(solucion) ? solucion : "institucional",
      // Vacío es transversal, no un dato faltante — ver la migración.
      industria: esIndustria(industria) ? industria : null,
      descripcion: textoDelForm(form, "descripcion", LIMITES.descripcion) || null,
      cuando_usar: textoDelForm(form, "cuandoUsar", LIMITES.cuandoUsar) || null,
      etiquetas: etiquetasDelForm(form) ?? [],
      archivo_ruta: subida.ruta,
      archivo_nombre: archivo.name.slice(0, LIMITES.nombreArchivo),
      archivo_tamano: archivo.size,
      autor_id: user?.id ?? null,
      // El nombre se congela acá — ver el comentario de la migración.
      autor_nombre: nombreDeUsuario(user),
    })
    .select(COLUMNAS_BROCHURE)
    .single()

  if (error || !data) {
    await borrarDelBucket([subida.ruta])
    console.error("[brochures POST]", error)
    return NextResponse.json({ error: "No se pudo guardar el brochure" }, { status: 500 })
  }

  const [brochure] = await conUrls([data])
  return NextResponse.json({ brochure }, { status: 201 })
})
