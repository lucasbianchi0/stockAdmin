import { NextResponse } from "next/server"

import { supabase } from "@/lib/supabase"
import type { Sesion } from "@/lib/sesion-server"
import { destinatarios } from "@/lib/marketing/contactos-server"
import type { Grupo } from "@/lib/marketing/contactos"

/**
 * Grupos de contactos: listas con nombre, armadas desde la tabla.
 *
 * Hoy sirven para filtrar y exportar. Están hechos para lo que viene: una
 * campaña de mail va a elegir un grupo como destinatarios, y cada envío va a
 * colgar de un miembro (`contacto_grupo_miembros`).
 */

const esDuplicado = (e: { code?: string } | null) => e?.code === "23505"

const nombreValido = (v: unknown) =>
  typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, 80) : ""

export async function listarGrupos() {
  const { data, error } = await supabase
    .from("contacto_grupos")
    .select("id, nombre, descripcion, created_by_nombre, created_at, miembros:contacto_grupo_miembros(count)")
    .order("nombre")
  if (error) throw error

  const grupos: Grupo[] = (data ?? []).map((g) => ({
    id: g.id,
    nombre: g.nombre,
    descripcion: g.descripcion,
    miembros: (g.miembros as unknown as { count: number }[])?.[0]?.count ?? 0,
    creadoPor: g.created_by_nombre,
    createdAt: g.created_at,
  }))
  return NextResponse.json({ grupos })
}

/**
 * Sumar personas a un grupo: `{ grupoId | nuevoNombre, ids | filtro }`.
 * Con `nuevoNombre` el grupo se crea en el mismo paso. Sumar a alguien que ya
 * estaba no lo duplica.
 */
export async function agregarAGrupo(req: Request, yo: Sesion) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const ids = await destinatarios(b)
  if (ids.length === 0) return NextResponse.json({ error: "No hay a quién sumar" }, { status: 400 })

  let grupoId = typeof b.grupoId === "string" ? b.grupoId : ""
  let creado = false
  if (!grupoId) {
    const nombre = nombreValido(b.nuevoNombre)
    if (!nombre) return NextResponse.json({ error: "Poné un nombre al grupo" }, { status: 400 })
    const { data, error } = await supabase
      .from("contacto_grupos")
      .insert({ nombre, created_by: yo.id, created_by_nombre: yo.nombre })
      .select("id")
      .single()
    if (esDuplicado(error)) {
      return NextResponse.json({ error: `Ya hay un grupo que se llama "${nombre}"` }, { status: 409 })
    }
    if (error) throw error
    grupoId = data.id
    creado = true
  }

  let antes = 0
  if (!creado) {
    const { count } = await supabase
      .from("contacto_grupo_miembros")
      .select("contacto_id", { count: "exact", head: true })
      .eq("grupo_id", grupoId)
    antes = count ?? 0
  }

  for (let i = 0; i < ids.length; i += 500) {
    const { error } = await supabase.from("contacto_grupo_miembros").upsert(
      ids.slice(i, i + 500).map((contacto_id) => ({ grupo_id: grupoId, contacto_id, added_by: yo.id })),
      { onConflict: "grupo_id,contacto_id", ignoreDuplicates: true }
    )
    if (error) throw error
  }

  const { count: despues } = await supabase
    .from("contacto_grupo_miembros")
    .select("contacto_id", { count: "exact", head: true })
    .eq("grupo_id", grupoId)

  return NextResponse.json({ grupoId, creado, agregados: (despues ?? 0) - antes, total: despues ?? 0 })
}

/** Sacar personas de un grupo: `{ ids | filtro }`. Las personas no se tocan. */
export async function quitarDeGrupo(req: Request, grupoId: string) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const ids = await destinatarios(b)
  if (ids.length === 0) return NextResponse.json({ error: "No hay a quién sacar" }, { status: 400 })
  for (let i = 0; i < ids.length; i += 500) {
    const { error } = await supabase
      .from("contacto_grupo_miembros")
      .delete()
      .eq("grupo_id", grupoId)
      .in("contacto_id", ids.slice(i, i + 500))
    if (error) throw error
  }
  return NextResponse.json({ quitados: ids.length })
}

export async function editarGrupo(req: Request, grupoId: string) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const cambios: Record<string, unknown> = {}
  if ("nombre" in b) {
    const nombre = nombreValido(b.nombre)
    if (!nombre) return NextResponse.json({ error: "El nombre no puede quedar vacío" }, { status: 400 })
    cambios.nombre = nombre
  }
  if ("descripcion" in b) {
    cambios.descripcion = typeof b.descripcion === "string" && b.descripcion.trim() ? b.descripcion.trim().slice(0, 300) : null
  }
  const { error } = await supabase.from("contacto_grupos").update(cambios).eq("id", grupoId)
  if (esDuplicado(error)) return NextResponse.json({ error: "Ya hay un grupo con ese nombre" }, { status: 409 })
  if (error) throw error
  return NextResponse.json({ ok: true })
}

/** Borra el grupo y su lista. Las personas siguen en Contactos. */
export async function borrarGrupo(grupoId: string) {
  const { error } = await supabase.from("contacto_grupos").delete().eq("id", grupoId)
  if (error) throw error
  return NextResponse.json({ ok: true })
}
