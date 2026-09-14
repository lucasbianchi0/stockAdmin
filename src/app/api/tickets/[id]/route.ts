import { NextResponse, after } from "next/server"

import { ruta } from "@/lib/admin/ruta"
import { exigirAlgunModulo } from "@/lib/guard-api"
import { MODULOS } from "@/lib/permisos"
import { supabase } from "@/lib/supabase"
import { LIMITES, esEstado } from "@/lib/tickets"
import {
  BUCKET_TICKETS,
  COLUMNAS_TICKET,
  aTicket,
  ordenInicial,
  recortar,
  resolverAsignado,
  uuid,
} from "@/lib/tickets-server"

type Ctx = { params: Promise<{ id: string }> }

const PERMISO = [...MODULOS]

/* ── PATCH · editar ───────────────────────────────────────────────────────── */

/**
 * Edita cualquiera, no sólo quien lo creó.
 *
 * Es la misma decisión que gobierna toda la pantalla: el tablero es del equipo.
 * Si un ticket está mal escrito o le falta el proyecto, el que lo nota lo
 * arregla; esperar al autor es la forma de que nunca se arregle. El crédito sí
 * se conserva: `autor_id` y `autor_nombre` no se tocan nunca.
 *
 * Sólo se escriben las claves que vinieron en el body. Así el diálogo puede
 * mandar un cambio suelto —mover de columna, reasignar— sin arrastrar el resto
 * del ticket y pisar lo que otro acaba de editar.
 */
export const PATCH = ruta("tickets PATCH", async (req: Request, ctx: Ctx) => {
  const sinPermiso = await exigirAlgunModulo(PERMISO)
  if (sinPermiso) return sinPermiso

  const { id } = await ctx.params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }
  const raw = (body ?? {}) as Record<string, unknown>

  const cambios: Record<string, unknown> = {}

  if ("titulo" in raw) {
    const titulo = recortar(raw.titulo, LIMITES.titulo)
    if (!titulo) return NextResponse.json({ error: "Falta el título" }, { status: 400 })
    cambios.titulo = titulo
  }

  if ("descripcion" in raw) {
    cambios.descripcion = recortar(raw.descripcion, LIMITES.descripcion) || null
  }

  if ("estado" in raw && esEstado(raw.estado)) {
    cambios.estado = raw.estado

    // Cambiar de columna desde el diálogo es lo mismo que arrastrar la tarjeta,
    // y tiene que dejarla donde la dejaría el arrastre: arriba de la columna
    // nueva. Sin esto conserva el `orden` de la anterior y aparece en una
    // posición que no eligió nadie —a veces la última, a veces el medio—, que es
    // como la pantalla empieza a sentirse impredecible.
    const { data: actual } = await supabase
      .from("tickets")
      .select("estado")
      .eq("id", id)
      .maybeSingle()

    if (actual && actual.estado !== raw.estado) {
      cambios.orden = await ordenInicial(raw.estado)
    }
  }

  if ("proyectoId" in raw) cambios.proyecto_id = uuid(raw.proyectoId)

  if ("asignadoId" in raw) {
    const asignado = await resolverAsignado(raw.asignadoId)
    cambios.asignado_id = asignado?.id ?? null
    cambios.asignado_nombre = asignado?.nombre ?? null
  }

  if (Object.keys(cambios).length === 0) {
    return NextResponse.json({ error: "Nada para cambiar" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("tickets")
    .update(cambios)
    .eq("id", id)
    .select(COLUMNAS_TICKET)
    .single()

  if (error || !data) {
    console.error("[tickets PATCH]", error)
    return NextResponse.json({ error: "No se pudo guardar el ticket" }, { status: 500 })
  }

  return NextResponse.json({ ticket: aTicket(data) })
})

/* ── DELETE · borrar ──────────────────────────────────────────────────────── */

export const DELETE = ruta("tickets DELETE", async (_req: Request, ctx: Ctx) => {
  const sinPermiso = await exigirAlgunModulo(PERMISO)
  if (sinPermiso) return sinPermiso

  const { id } = await ctx.params

  const { error } = await supabase.from("tickets").delete().eq("id", id)

  if (error) {
    console.error("[tickets DELETE]", error)
    return NextResponse.json({ error: "No se pudo borrar el ticket" }, { status: 500 })
  }

  /*
   * La limpieza de Storage va DESPUÉS de contestar.
   *
   * Borrar un ticket es una sola sentencia; listar y borrar sus archivos son dos
   * viajes más, y quien apretó el botón los estaba esperando sin motivo: el
   * ticket ya no existe igual. Con `after` la respuesta sale al terminar el
   * delete y el resto corre con el pedido ya cerrado.
   *
   * Se listan los objetos de la carpeta en vez de leer `ticket_imagenes` antes
   * —que era lo que había que hacer para adelantarse a la cascada—: cada ticket
   * tiene su carpeta propia, así que la carpeta ES la lista. Una consulta menos
   * y nada que sincronizar.
   */
  after(async () => {
    try {
      const { data } = await supabase.storage.from(BUCKET_TICKETS).list(id)
      const rutas = (data ?? []).map((o) => `${id}/${o.name}`)
      if (rutas.length > 0) await supabase.storage.from(BUCKET_TICKETS).remove(rutas)
    } catch (e) {
      // El ticket ya no está: un archivo suelto es basura, no una falla para
      // quien lo borró.
      console.error("[tickets DELETE storage]", e)
    }
  })

  return NextResponse.json({ ok: true })
})
