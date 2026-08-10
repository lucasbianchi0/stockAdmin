import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { ruta } from "@/lib/admin/ruta"
import {
  aCliente,
  respuestaDeErrorDeBase,
  validarEntidad,
} from "@/lib/admin/entidades-server"

const SELECT = "*, vendedor:vendedores (id, nombre)"

type Ctx = { params: Promise<{ id: string }> }

/* ── GET · una ficha ──────────────────────────────────────────────────────── */

export const GET = ruta("clientes GET id", async (_req: Request, ctx: Ctx) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso

  const { id } = await ctx.params

  const { data, error } = await supabase
    .from("clientes")
    .select(SELECT)
    .eq("id", id)
    .maybeSingle()

  if (error) {
    console.error("[clientes GET id]", error)
    return NextResponse.json({ error: "No se pudo cargar el cliente" }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 })

  return NextResponse.json({ cliente: aCliente(data) })
})

/* ── PATCH · edición ──────────────────────────────────────────────────────── */

export const PATCH = ruta("clientes PATCH", async (req: Request, ctx: Ctx) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso

  const { id } = await ctx.params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }

  // `excluirId` para que editar un cliente sin tocarle el CUIT no choque contra
  // su propio CUIT y devuelva "ya está cargado en «él mismo»".
  const validado = await validarEntidad(body as Record<string, unknown>, { excluirId: id })
  if ("error" in validado) {
    return NextResponse.json({ error: validado.error }, { status: validado.status })
  }

  const { data, error } = await supabase
    .from("clientes")
    .update(validado.fila)
    .eq("id", id)
    .select(SELECT)
    .maybeSingle()

  if (error) return respuestaDeErrorDeBase(error, "editar")
  if (!data) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 })

  return NextResponse.json({ cliente: aCliente(data) })
})

/* ── DELETE · baja lógica o borrado definitivo ────────────────────────────── */

/**
 * Dos operaciones bajo el mismo verbo, según `?modo=`:
 *
 *  · **baja** (por defecto) — `activo = false`. El cliente sale de los
 *    selectores y del listado, pero su historia sigue entera. Es lo correcto
 *    para alguien que dejó de operar: sus facturas del año pasado siguen siendo
 *    parte de la contabilidad.
 *
 *  · **eliminar** — lo borra de verdad. Es para el error de carga: la ficha
 *    duplicada, el nombre mal escrito, la prueba. Sin esto el maestro se llena
 *    de basura que no se puede sacar.
 *
 * Quién decide si el borrado es seguro no es este código, es Postgres. Cuando
 * existan los comprobantes (fase 4) la FK va a estar en `on delete restrict`, y
 * el intento de borrar un cliente con facturas va a devolver un 23503 que se
 * traduce abajo. Preguntarle antes a la base "¿tiene facturas?" sería una
 * carrera: entre la pregunta y el borrado alguien puede cargar una.
 */
export const DELETE = ruta("clientes DELETE", async (req: Request, ctx: Ctx) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso

  const { id } = await ctx.params
  const modo = new URL(req.url).searchParams.get("modo")

  if (modo === "eliminar") {
    const { data, error } = await supabase
      .from("clientes")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle()

    if (error) {
      // 23503 = violación de clave foránea: algo cuelga de este cliente.
      if (error.code === "23503") {
        return NextResponse.json(
          {
            error:
              "No se puede eliminar: el cliente tiene comprobantes o cobros cargados. Dalo de baja para sacarlo de las listas sin perder su historia.",
          },
          { status: 409 }
        )
      }
      console.error("[clientes DELETE eliminar]", error)
      return NextResponse.json({ error: "No se pudo eliminar el cliente" }, { status: 500 })
    }
    if (!data) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 })

    return NextResponse.json({ ok: true, eliminado: true })
  }

  const { data, error } = await supabase
    .from("clientes")
    .update({ activo: false })
    .eq("id", id)
    .select("id")
    .maybeSingle()

  if (error) {
    console.error("[clientes DELETE baja]", error)
    return NextResponse.json({ error: "No se pudo dar de baja el cliente" }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 })

  return NextResponse.json({ ok: true, eliminado: false })
})
