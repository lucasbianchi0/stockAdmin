import { NextResponse } from "next/server"

import { exigirAdmin } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { ruta } from "@/lib/admin/ruta"
import { leerHistorialCierre } from "@/lib/admin/cierre-server"
import { esMes, fechaCierre, finDeMes, mesAnterior } from "@/lib/admin/cierre"

/**
 * Reabrir: volver la fecha de cierre para atrás.
 *
 * Solo administradores y siempre con motivo, porque es exactamente lo que el
 * cierre existe para evitar: tocar algo que el estudio ya presentó. No se borra
 * el cierre anterior; se agrega una reapertura al historial, que es lo que deja
 * contestar después quién la abrió, cuándo y por qué.
 *
 * `desde` es el primer mes que vuelve a quedar abierto: reabrir septiembre deja
 * cerrado hasta el 31 de agosto. `null` reabre todo.
 */
export const POST = ruta("cierre reabrir POST", async (req: Request) => {
  const { error: sinPermiso, usuarioId } = await exigirAdmin(
    "Solo un administrador puede reabrir un período cerrado"
  )
  if (sinPermiso) return sinPermiso

  const cuerpo = (await req.json().catch(() => ({}))) as { desde?: unknown; motivo?: unknown }
  const motivo = typeof cuerpo.motivo === "string" ? cuerpo.motivo.trim().slice(0, 500) : ""
  if (!motivo) {
    return NextResponse.json({ error: "Contá por qué se reabre: queda en el historial" }, { status: 400 })
  }
  if (cuerpo.desde !== null && !esMes(cuerpo.desde)) {
    return NextResponse.json({ error: "Elegí desde qué mes se reabre" }, { status: 400 })
  }
  const hasta = cuerpo.desde === null ? null : finDeMes(mesAnterior(cuerpo.desde as string))

  const historial = await leerHistorialCierre()
  const actual = historial[0]?.hasta ?? null
  if (!actual) {
    return NextResponse.json({ error: "No hay ningún período cerrado" }, { status: 409 })
  }
  if (hasta && hasta >= actual) {
    return NextResponse.json(
      { error: `Está cerrado hasta el ${fechaCierre(actual)}: ese mes ya está abierto.` },
      { status: 409 }
    )
  }

  const { error } = await supabase.from("cierres_periodo").insert({
    hasta,
    accion: "reapertura",
    motivo,
    created_by: usuarioId,
  })
  if (error) throw error

  return NextResponse.json({ hasta })
})
