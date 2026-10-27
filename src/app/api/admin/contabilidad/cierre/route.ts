import { NextResponse } from "next/server"

import { exigirModuloConUsuario } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { ruta } from "@/lib/admin/ruta"
import { hoyArgentina } from "@/lib/admin/fecha"
import { leerHistorialCierre } from "@/lib/admin/cierre-server"
import { esMes, fechaCierre, finDeMes, type EstadoCierre } from "@/lib/admin/cierre"

/**
 * El cierre de períodos: hasta dónde está cerrado, el historial, y cerrar un
 * mes más.
 *
 * Cerrar lo puede hacer cualquiera de Administración —es la rutina de fin de
 * mes—; reabrir, solo un administrador (ver `reabrir/route.ts`). Lo que hace
 * cumplir el cierre no está acá sino en los triggers de la base: esta ruta solo
 * escribe la fecha.
 */

export const GET = ruta("cierre GET", async () => {
  // El permiso y si es admin, de la misma lectura del token: antes eran dos.
  const s = await exigirModuloConUsuario(["administracion"])
  if (s.error) return s.error

  const historial = await leerHistorialCierre()

  const estado: EstadoCierre = {
    hasta: historial[0]?.hasta ?? null,
    historial,
    puedeReabrir: s.admin,
  }
  return NextResponse.json(estado)
})

export const POST = ruta("cierre POST", async (req: Request) => {
  const s = await exigirModuloConUsuario(["administracion"])
  if (s.error) return s.error

  const cuerpo = (await req.json().catch(() => ({}))) as { mes?: unknown; motivo?: unknown }
  if (!esMes(cuerpo.mes)) {
    return NextResponse.json({ error: "Elegí el mes hasta el que se cierra" }, { status: 400 })
  }
  const hasta = finDeMes(cuerpo.mes)

  // Un mes que todavía no terminó no se cierra: lo que falta cargar de él
  // quedaría afuera sin que nadie lo decida.
  if (hasta >= hoyArgentina()) {
    return NextResponse.json(
      { error: "Solo se puede cerrar un mes que ya terminó" },
      { status: 400 }
    )
  }

  const historial = await leerHistorialCierre()
  const actual = historial[0]?.hasta ?? null
  if (actual && hasta <= actual) {
    return NextResponse.json(
      {
        error: `Ya está cerrado hasta el ${fechaCierre(actual)}. Para volver atrás hay que reabrir el período.`,
      },
      { status: 409 }
    )
  }

  const motivo = typeof cuerpo.motivo === "string" ? cuerpo.motivo.trim().slice(0, 500) : ""

  const { error } = await supabase.from("cierres_periodo").insert({
    hasta,
    accion: "cierre",
    motivo: motivo || null,
    created_by: s.usuarioId,
  })
  if (error) throw error

  return NextResponse.json({ hasta })
})
