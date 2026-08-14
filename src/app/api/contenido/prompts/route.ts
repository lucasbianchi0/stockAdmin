import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { createSupabaseServer } from "@/lib/supabase-server"

/**
 * Los prompts propios que crea el equipo. Los del sistema no pasan por acá: son
 * estáticos y viven en `prompts-sistema.ts`, que la página importa directo.
 */

type Fila = Record<string, unknown>

function aPromptCliente(f: Fila) {
  return {
    id: String(f.id),
    nombre: String(f.nombre ?? ""),
    descripcion: typeof f.descripcion === "string" ? f.descripcion : "",
    cuerpo: String(f.cuerpo ?? ""),
    autor: typeof f.created_by_email === "string" ? f.created_by_email : null,
    createdAt: String(f.created_at ?? ""),
  }
}

export async function GET() {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const { data, error } = await supabase
    .from("content_prompts")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[contenido/prompts GET]", error)
    return NextResponse.json({ error: "No se pudieron cargar los prompts" }, { status: 500 })
  }

  return NextResponse.json({ prompts: (data ?? []).map(aPromptCliente) })
}

export async function POST(req: Request) {
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
  const nombre = typeof raw.nombre === "string" ? raw.nombre.trim().slice(0, 120) : ""
  const cuerpo = typeof raw.cuerpo === "string" ? raw.cuerpo.trim().slice(0, 20000) : ""
  const descripcion = typeof raw.descripcion === "string" ? raw.descripcion.trim().slice(0, 400) : ""

  if (!nombre) return NextResponse.json({ error: "Poné un nombre" }, { status: 400 })
  if (!cuerpo) return NextResponse.json({ error: "El prompt no puede estar vacío" }, { status: 400 })

  // El autor sale de la sesión: es lo que hace que el prompt quede a nombre de
  // quien lo creó. Con el email desnormalizado se muestra sin un join.
  const supabaseUsuario = await createSupabaseServer()
  const {
    data: { user },
  } = await supabaseUsuario.auth.getUser()

  const { data, error } = await supabase
    .from("content_prompts")
    .insert({
      nombre,
      descripcion: descripcion || null,
      cuerpo,
      created_by: user?.id ?? null,
      created_by_email: user?.email ?? null,
    })
    .select()
    .single()

  if (error || !data) {
    console.error("[contenido/prompts POST]", error)
    return NextResponse.json({ error: "No se pudo guardar el prompt" }, { status: 500 })
  }

  return NextResponse.json({ prompt: aPromptCliente(data) }, { status: 201 })
}
