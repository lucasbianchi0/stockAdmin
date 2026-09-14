import { NextResponse } from "next/server"

import { ruta } from "@/lib/admin/ruta"
import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { LIMITES, nombrePropio } from "@/lib/marketing/eventos"
import { COLUMNAS_ASISTENTE, aAsistente, codigoNuevo } from "@/lib/marketing/eventos-server"

type Ctx = { params: Promise<{ id: string }> }

/**
 * Alta de asistentes, de a uno o de a cientos.
 *
 * Llega ya parseado por el cliente (`parsearAsistentes`), así la persona ve la
 * lista antes de confirmarla. Acá se vuelve a limpiar igual: el cliente es
 * comodidad, esto es la regla.
 *
 * Los repetidos se saltean en vez de duplicarse: pegar dos veces la misma
 * planilla —pasa siempre, la segunda "para ver si se guardó"— no puede emitir
 * dos certificados con dos códigos distintos para la misma persona. Se compara
 * por email si hay, y si no por nombre sin acentos ni mayúsculas.
 */
export const POST = ruta("asistentes POST", async (req: Request, ctx: Ctx) => {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const { id } = await ctx.params

  let crudos: unknown[]
  try {
    const body = (await req.json()) as { asistentes?: unknown }
    if (!Array.isArray(body.asistentes)) throw new Error()
    crudos = body.asistentes
  } catch {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 })
  }

  const { data: evento } = await supabase.from("eventos").select("inicio").eq("id", id).maybeSingle()
  if (!evento) return NextResponse.json({ error: "El evento ya no existe" }, { status: 404 })

  const { data: existentes } = await supabase
    .from("evento_asistentes")
    .select("nombre, email")
    .eq("evento_id", id)

  const clave = (nombre: string, email: string) =>
    email
      ? `m:${email.toLowerCase()}`
      : `n:${nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()}`

  const vistos = new Set((existentes ?? []).map((a) => clave(String(a.nombre), String(a.email ?? ""))))

  const filas: Record<string, unknown>[] = []
  for (const c of crudos.slice(0, LIMITES.asistentesPorCarga)) {
    const a = (c && typeof c === "object" ? c : {}) as Record<string, unknown>
    const nombre = nombrePropio(String(a.nombre ?? "")).slice(0, LIMITES.asistenteNombre)
    if (!nombre) continue
    const email = String(a.email ?? "").trim().toLowerCase().slice(0, LIMITES.asistenteEmail)
    const k = clave(nombre, email)
    if (vistos.has(k)) continue
    vistos.add(k)
    filas.push({
      evento_id: id,
      nombre,
      email: email || null,
      empresa: String(a.empresa ?? "").trim().slice(0, LIMITES.asistenteEmpresa) || null,
      codigo: codigoNuevo(String(evento.inicio)),
    })
  }

  if (filas.length === 0) {
    return NextResponse.json({ asistentes: [], salteados: crudos.length })
  }

  const { data, error } = await supabase.from("evento_asistentes").insert(filas).select(COLUMNAS_ASISTENTE)

  if (error) {
    console.error("[asistentes POST]", error)
    return NextResponse.json({ error: "No se pudieron cargar los asistentes" }, { status: 500 })
  }

  return NextResponse.json(
    { asistentes: (data ?? []).map(aAsistente), salteados: crudos.length - filas.length },
    { status: 201 }
  )
})
