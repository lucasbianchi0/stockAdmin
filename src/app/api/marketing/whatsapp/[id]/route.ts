import { NextResponse } from "next/server"

import { ruta } from "@/lib/admin/ruta"
import { sesionConModulo } from "@/lib/sesion-server"
import { mensajesDe } from "@/lib/whatsapp-server"

const UUID = /^[0-9a-f-]{36}$/i

/** Los mensajes de una conversación, del más viejo al más nuevo. */
export const GET = ruta(
  "whatsapp mensajes GET",
  async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const s = await sesionConModulo(["marketing"])
    if ("respuesta" in s) return s.respuesta
    const { id } = await params
    if (!UUID.test(id)) return NextResponse.json({ error: "Conversación inválida" }, { status: 400 })
    return NextResponse.json({ mensajes: await mensajesDe(id) })
  }
)
