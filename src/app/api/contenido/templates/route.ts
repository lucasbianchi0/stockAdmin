import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { createSupabaseServer } from "@/lib/supabase-server"
import { TEMPLATES, promptDeTemplate, type TemplatePieza } from "@/lib/templates-pieza"

/**
 * Los templates, con su receta vigente y su historial.
 *
 * El archivo `templates-pieza.ts` deja de ser la fuente y pasa a ser la
 * SEMILLA: la primera vez que se pide el listado, los quince se insertan como
 * versión 1. A partir de ahí manda la base, porque es lo único que puede
 * guardar historia.
 *
 * Devuelve además el PROMPT armado de cada uno —receta más identidad de marca,
 * exactamente como viaja al modelo—. Es lo que permite entender por qué un
 * template da lo que da sin tener que abrir el código.
 */

const PLACEHOLDERS = {
  titular: "[el titular de la pieza]",
  sujeto: "[qué muestra la foto]",
  etiqueta: "[etiqueta]",
}

export async function GET() {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  await sembrarSiHaceFalta()

  const { data: filas, error } = await supabase
    .from("templates")
    .select("*, versiones:template_versiones (id, numero, composicion, nota, created_at)")
    .order("orden")

  if (error) {
    console.error("[templates GET]", error)
    return NextResponse.json({ error: "No se pudieron cargar los templates" }, { status: 500 })
  }

  const templates = (filas ?? []).map((f) => {
    const versiones = [...((f.versiones ?? []) as Version[])].sort((a, b) => b.numero - a.numero)
    const vigente = versiones[0]

    const receta: TemplatePieza = {
      id: String(f.slug),
      nombre: String(f.nombre),
      cuandoUsar: String(f.cuando_usar ?? ""),
      // La densidad no está en la tabla: sale de la definición en código, que
      // comparte el espacio de slugs. Un template creado solo en la base cae a
      // "mixta", que es la que no impone restricciones en la grilla — preferible
      // a inventarle un peso visual que nadie miró.
      densidad: TEMPLATES.find((t) => t.id === String(f.slug))?.densidad ?? "mixta",
      llevaFoto: f.lleva_foto !== false,
      fotoColor: f.foto_color === true,
      composicion: vigente?.composicion ?? "",
    }

    return {
      id: String(f.id),
      slug: receta.id,
      nombre: receta.nombre,
      cuandoUsar: receta.cuandoUsar,
      llevaFoto: receta.llevaFoto,
      fotoColor: receta.fotoColor,
      activo: f.activo !== false,
      composicion: receta.composicion,
      versionActual: vigente?.numero ?? 0,
      versiones,
      // El prompt completo, con marcadores donde va el contenido variable.
      prompt: promptDeTemplate({
        template: receta,
        titular: PLACEHOLDERS.titular,
        sujeto: receta.llevaFoto ? PLACEHOLDERS.sujeto : undefined,
        etiqueta: PLACEHOLDERS.etiqueta,
      }),
    }
  })

  return NextResponse.json({ templates })
}

/* ── POST · nueva versión de la receta ────────────────────────────────────── */

export async function POST(req: Request) {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }
  const raw = (body ?? {}) as Record<string, unknown>

  const id = typeof raw.id === "string" ? raw.id : ""
  const composicion =
    typeof raw.composicion === "string" ? raw.composicion.trim().slice(0, 4000) : ""
  const nota = typeof raw.nota === "string" ? raw.nota.trim().slice(0, 300) : null

  if (!id || !composicion) {
    return NextResponse.json({ error: "Faltan datos" }, { status: 400 })
  }

  const { data: ultima } = await supabase
    .from("template_versiones")
    .select("numero")
    .eq("template_id", id)
    .order("numero", { ascending: false })
    .limit(1)
    .maybeSingle()

  const supabaseUsuario = await createSupabaseServer()
  const {
    data: { user },
  } = await supabaseUsuario.auth.getUser()

  const { error } = await supabase.from("template_versiones").insert({
    template_id: id,
    numero: (ultima?.numero ?? 0) + 1,
    composicion,
    nota,
    created_by: user?.id ?? null,
  })

  if (error) {
    console.error("[templates POST]", error)
    return NextResponse.json({ error: "No se pudo guardar la versión" }, { status: 500 })
  }

  await supabase.from("templates").update({ updated_at: new Date().toISOString() }).eq("id", id)

  return NextResponse.json({ ok: true })
}

/* ── Semilla ──────────────────────────────────────────────────────────────── */

type Version = {
  id: string
  numero: number
  composicion: string
  nota: string | null
  created_at: string
}

/**
 * Inserta los templates del código la primera vez, y solo la primera.
 *
 * Se compara por slug y no por cantidad: si mañana se agrega uno al archivo,
 * entra sin duplicar los que ya están ni pisar sus versiones editadas.
 */
async function sembrarSiHaceFalta() {
  const { data } = await supabase.from("templates").select("slug")
  const existentes = new Set((data ?? []).map((f) => String(f.slug)))

  const faltantes = TEMPLATES.filter((t) => !existentes.has(t.id))
  if (faltantes.length === 0) return

  for (const [i, t] of faltantes.entries()) {
    const { data: fila } = await supabase
      .from("templates")
      .insert({
        slug: t.id,
        nombre: t.nombre,
        cuando_usar: t.cuandoUsar,
        lleva_foto: t.llevaFoto,
        foto_color: t.fotoColor ?? false,
        orden: existentes.size + i,
      })
      .select("id")
      .single()

    if (fila) {
      await supabase.from("template_versiones").insert({
        template_id: fila.id,
        numero: 1,
        composicion: t.composicion,
        nota: "Versión inicial, sembrada desde el código.",
      })
    }
  }
}
