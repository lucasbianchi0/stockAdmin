import { NextResponse } from "next/server"

import { ruta } from "@/lib/admin/ruta"
import { sesionConModulo } from "@/lib/sesion-server"
import { whatsappDeContacto } from "@/lib/whatsapp-server"

const UUID = /^[0-9a-f-]{36}$/i

/** El chat de WhatsApp de un contacto, para su ficha en Contactos y en el CRM. */
export const GET = ruta(
  "contacto whatsapp GET",
  async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const s = await sesionConModulo(["marketing", "comercial"])
    if ("respuesta" in s) return s.respuesta
    const { id } = await params
    if (!UUID.test(id)) return NextResponse.json({ error: "Contacto inválido" }, { status: 400 })
    return NextResponse.json({ chats: await whatsappDeContacto(id) })
  }
)
