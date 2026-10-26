import { NextResponse } from "next/server"

import { ruta } from "@/lib/admin/ruta"
import { firmaValida, procesarWebhook } from "@/lib/whatsapp-server"

/**
 * Donde Kapso avisa de cada mensaje del WhatsApp de Accedra.
 *
 * ── LA PUERTA ──
 *
 * El middleware la deja pasar sin sesión porque Kapso no tiene una. La
 * protección es la firma: Kapso firma el cuerpo con HMAC-SHA256 usando el
 * secreto del webhook (`KAPSO_WEBHOOK_SECRET`), y lo que no trae la firma
 * correcta se rechaza antes de leerlo. Sin el secreto configurado la ruta
 * contesta 404: abierta sin firma sería peor que no existir.
 *
 * Contesta 200 apenas guarda: Kapso espera la respuesta 10 segundos y si no
 * llega reintenta, lo que no duplica nada (el `wamid` es único) pero sí ensucia.
 */
export const POST = ruta("whatsapp webhook", async (req: Request) => {
  const secreto = process.env.KAPSO_WEBHOOK_SECRET
  if (!secreto) return new NextResponse(null, { status: 404 })

  const cuerpo = await req.text()
  if (!firmaValida(cuerpo, req.headers.get("x-webhook-signature"), secreto)) {
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 })
  }

  let json: unknown
  try {
    json = JSON.parse(cuerpo)
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 })
  }

  const nuevos = await procesarWebhook(req.headers.get("x-webhook-event"), json)
  return NextResponse.json({ ok: true, nuevos })
})
