import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { ruta } from "@/lib/admin/ruta"
import { LARGO_MAX, textoONull, type TipoEntidad } from "@/lib/admin/entidades"

/**
 * Las categorías de clientes y proveedores.
 *
 * `?tipo=proveedor` trae las de proveedores más las de `ambos`: una categoría de
 * proveedor en el selector de un cliente es ruido, y ofrecerla solo sirve para
 * que alguien la elija por error.
 */
export const GET = ruta("categorias GET", async (req: Request) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso

  const url = new URL(req.url)
  const tipo = url.searchParams.get("tipo")
  const todas = url.searchParams.get("todas") === "1"

  let query = supabase
    .from("categorias_entidad")
    .select("id, nombre, tipo, descripcion, activo, orden")

  if (!todas) query = query.eq("activo", true)
  if (tipo === "cliente" || tipo === "proveedor") {
    query = query.in("tipo", [tipo, "ambos"])
  }

  const { data, error } = await query
    .order("orden", { ascending: true })
    .order("nombre", { ascending: true })

  if (error) {
    console.error("[categorias GET]", error)
    return NextResponse.json({ error: "No se pudieron cargar las categorías" }, { status: 500 })
  }

  return NextResponse.json({
    categorias: (data ?? []).map((c) => ({
      id: c.id as string,
      nombre: c.nombre as string,
      tipo: c.tipo as TipoEntidad | "ambos",
      descripcion: (c.descripcion as string | null) ?? null,
      activo: Boolean(c.activo),
      orden: Number(c.orden ?? 0),
    })),
  })
})

/**
 * Alta de una categoría desde el mismo formulario de la ficha.
 *
 * Obligar a ir a otra pantalla a crear la categoría antes de poder guardar un
 * proveedor es fricción sin contrapartida: lo que pasa en la práctica es que se
 * deja sin categoría y el filtro nunca se termina de poblar.
 */
export const POST = ruta("categorias POST", async (req: Request) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }

  const raw = (body ?? {}) as Record<string, unknown>
  const nombre = textoONull(raw.nombre, LARGO_MAX.texto)
  if (!nombre) return NextResponse.json({ error: "La categoría necesita un nombre" }, { status: 400 })

  const tipo =
    raw.tipo === "cliente" || raw.tipo === "proveedor" || raw.tipo === "ambos"
      ? raw.tipo
      : "proveedor"

  const { data, error } = await supabase
    .from("categorias_entidad")
    .insert({ nombre, tipo, descripcion: textoONull(raw.descripcion, 300) })
    .select("id, nombre, tipo, descripcion, activo, orden")
    .single()

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Ya existe una categoría con ese nombre" }, { status: 409 })
    }
    console.error("[categorias POST]", error)
    return NextResponse.json({ error: "No se pudo crear la categoría" }, { status: 500 })
  }

  return NextResponse.json({ categoria: data }, { status: 201 })
})
