import { NextResponse } from "next/server"

import { ruta } from "@/lib/admin/ruta"
import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { medidaValida, type Formato } from "@/lib/generador"
import { usuarioActual } from "@/lib/generador-server"

const aFormato = (f: Record<string, unknown>): Formato => ({
  id: String(f.id),
  nombre: String(f.nombre),
  ancho: Number(f.ancho),
  alto: Number(f.alto),
})

/** Los formatos que guardó el equipo. Los estándar viven en el código. */
export const GET = ruta("generador formatos GET", async () => {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const { data, error } = await supabase
    .from("generador_formatos")
    .select("id, nombre, ancho, alto")
    .order("nombre")

  if (error) {
    console.error("[generador formatos GET]", error)
    return NextResponse.json({ error: "No se pudieron cargar los formatos" }, { status: 500 })
  }
  return NextResponse.json({ formatos: (data ?? []).map(aFormato) })
})

export const POST = ruta("generador formatos POST", async (req: Request) => {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  let raw: Record<string, unknown>
  try {
    raw = (await req.json()) ?? {}
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }

  const nombre = typeof raw.nombre === "string" ? raw.nombre.trim().slice(0, 80) : ""
  if (!nombre) return NextResponse.json({ error: "Poné un nombre al formato" }, { status: 400 })
  if (!medidaValida(raw.ancho) || !medidaValida(raw.alto)) {
    return NextResponse.json({ error: "Medida inválida: entre 64 y 4096 px por lado" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("generador_formatos")
    .insert({ nombre, ancho: raw.ancho, alto: raw.alto, created_by: await usuarioActual() })
    .select("id, nombre, ancho, alto")
    .single()

  if (error || !data) {
    console.error("[generador formatos POST]", error)
    return NextResponse.json({ error: "No se pudo guardar el formato" }, { status: 500 })
  }
  return NextResponse.json({ formato: aFormato(data) }, { status: 201 })
})
