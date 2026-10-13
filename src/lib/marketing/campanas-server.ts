import { NextResponse } from "next/server"

import { supabase } from "@/lib/supabase"
import type { Sesion } from "@/lib/sesion-server"
import { destinatarios } from "@/lib/marketing/contactos-server"
import type { Campana } from "@/lib/marketing/contactos"

/**
 * Campañas en borrador.
 *
 * Crear una campaña es: juntar a los destinatarios en un grupo (nuevo, con el
 * nombre de la campaña, o uno que ya existe) y dejar anotado con qué plantilla
 * y por qué canal se les va a escribir. El envío llega después; lo que queda
 * hecho hoy es todo lo que ese envío va a necesitar.
 */

const esDuplicado = (e: { code?: string } | null) => e?.code === "23505"

export async function listarCampanas(req: Request) {
  const grupo = new URL(req.url).searchParams.get("grupo")
  let q = supabase
    .from("campanas")
    .select(
      "id, nombre, grupo_id, plantilla_id, canal, estado, origen, created_by_nombre, created_at, grupo:contacto_grupos(nombre, miembros:contacto_grupo_miembros(count)), plantilla:mensajes_plantilla(titulo)"
    )
    .order("created_at", { ascending: false })
  if (grupo) q = q.eq("grupo_id", grupo)
  const { data, error } = await q
  if (error) throw error

  const campanas: Campana[] = (data ?? []).map((c) => {
    const g = c.grupo as unknown as { nombre: string; miembros: { count: number }[] } | null
    const p = c.plantilla as unknown as { titulo: string } | null
    return {
      id: c.id,
      nombre: c.nombre,
      grupoId: c.grupo_id,
      grupoNombre: g?.nombre ?? "",
      destinatarios: g?.miembros?.[0]?.count ?? 0,
      plantillaId: c.plantilla_id,
      plantillaTitulo: p?.titulo ?? null,
      canal: c.canal,
      estado: c.estado,
      origen: c.origen,
      creadoPor: c.created_by_nombre,
      createdAt: c.created_at,
    }
  })
  return NextResponse.json({ campanas })
}

/**
 * `{ nombre, ids | filtro | grupoId, plantillaId?, canal?, origen? }`.
 * Sin `grupoId`, se crea un grupo con el nombre de la campaña y los elegidos.
 */
export async function crearCampana(req: Request, yo: Sesion) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const nombre = typeof b.nombre === "string" ? b.nombre.trim().replace(/\s+/g, " ").slice(0, 80) : ""
  if (!nombre) return NextResponse.json({ error: "Poné un nombre a la campaña" }, { status: 400 })
  const canal = b.canal === "whatsapp" ? "whatsapp" : "email"
  const origen = b.origen === "crm" ? "crm" : "contactos"
  const plantillaId = typeof b.plantillaId === "string" && b.plantillaId ? b.plantillaId : null

  let grupoId = typeof b.grupoId === "string" && b.grupoId ? b.grupoId : ""
  if (!grupoId) {
    const ids = await destinatarios(b)
    if (ids.length === 0) return NextResponse.json({ error: "Elegí a quién va" }, { status: 400 })

    const { data: g, error } = await supabase
      .from("contacto_grupos")
      .insert({
        nombre,
        descripcion: `Destinatarios de la campaña “${nombre}”`,
        created_by: yo.id,
        created_by_nombre: yo.nombre,
      })
      .select("id")
      .single()
    if (esDuplicado(error)) {
      return NextResponse.json(
        { error: `Ya hay un grupo que se llama "${nombre}": usá otro nombre para la campaña` },
        { status: 409 }
      )
    }
    if (error) throw error
    grupoId = g.id

    for (let i = 0; i < ids.length; i += 500) {
      const { error: e2 } = await supabase.from("contacto_grupo_miembros").upsert(
        ids.slice(i, i + 500).map((contacto_id) => ({ grupo_id: grupoId, contacto_id, added_by: yo.id })),
        { onConflict: "grupo_id,contacto_id", ignoreDuplicates: true }
      )
      if (e2) throw e2
    }
  }

  const { data, error } = await supabase
    .from("campanas")
    .insert({
      nombre,
      grupo_id: grupoId,
      plantilla_id: plantillaId,
      canal,
      origen,
      created_by: yo.id,
      created_by_nombre: yo.nombre,
    })
    .select("id")
    .single()
  if (error) throw error

  const { count } = await supabase
    .from("contacto_grupo_miembros")
    .select("contacto_id", { count: "exact", head: true })
    .eq("grupo_id", grupoId)

  return NextResponse.json({ campanaId: data.id, grupoId, destinatarios: count ?? 0 }, { status: 201 })
}

/** Borrar un borrador. El grupo queda: puede tener otros usos. */
export async function borrarCampana(id: string) {
  const { data, error } = await supabase.from("campanas").select("estado").eq("id", id).maybeSingle()
  if (error) throw error
  if (!data) return NextResponse.json({ error: "La campaña ya no existe" }, { status: 404 })
  if (data.estado !== "borrador") {
    return NextResponse.json({ error: "Solo se puede borrar una campaña en borrador" }, { status: 409 })
  }
  const { error: e2 } = await supabase.from("campanas").delete().eq("id", id)
  if (e2) throw e2
  return NextResponse.json({ ok: true })
}
