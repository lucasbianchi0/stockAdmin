import { NextResponse } from "next/server"

import { MODULOS } from "@/lib/permisos"
import { ruta } from "@/lib/admin/ruta"
import { sesionConModulo } from "@/lib/sesion-server"
import { listarEquipo } from "@/lib/tickets-server"

/** El equipo (id y nombre) y quién pregunta. Lo mismo que arma la ticketera. */
export const GET = ruta("equipo GET", async () => {
  const s = await sesionConModulo([...MODULOS])
  if ("respuesta" in s) return s.respuesta
  return NextResponse.json({ usuarios: await listarEquipo(), yo: s.sesion })
})
