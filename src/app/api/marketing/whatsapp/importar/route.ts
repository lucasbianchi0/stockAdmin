import { NextResponse } from "next/server"

import { ruta } from "@/lib/admin/ruta"
import { sesionConModulo } from "@/lib/sesion-server"
import { importarHistorial, kapsoConfigurado } from "@/lib/whatsapp-server"

/**
 * Copia lo que Kapso tiene del número: los seis meses de historial que trae al
 * conectar y cualquier mensaje que el webhook se haya perdido. Se puede apretar
 * las veces que haga falta; lo repetido se saltea.
 */
export const maxDuration = 60

export const POST = ruta("whatsapp importar POST", async () => {
  const s = await sesionConModulo(["marketing"])
  if ("respuesta" in s) return s.respuesta
  if (!kapsoConfigurado()) {
    return NextResponse.json({ error: "WhatsApp todavía no está conectado" }, { status: 409 })
  }
  return NextResponse.json(await importarHistorial())
})
