import { NextResponse } from "next/server"

import { ruta } from "@/lib/admin/ruta"
import { sesionConModulo } from "@/lib/sesion-server"
import { kapsoConfigurado, listarConversaciones } from "@/lib/whatsapp-server"

/** La bandeja: todas las conversaciones, la más reciente arriba. */
export const GET = ruta("whatsapp GET", async () => {
  const s = await sesionConModulo(["marketing"])
  if ("respuesta" in s) return s.respuesta
  return NextResponse.json({
    conversaciones: await listarConversaciones(),
    conectado: kapsoConfigurado(),
  })
})
