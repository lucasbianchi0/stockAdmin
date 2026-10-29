import { NextResponse } from "next/server"

import { ruta } from "@/lib/admin/ruta"
import { esClave } from "@/lib/calendario-equipo"
import { esSecretoDeCron, registrarCorrida } from "@/lib/calendario-equipo-server"

/**
 * Por acá avisa un agente o un proceso que corrió.
 *
 * Es para lo que no vive dentro de esta app: una rutina de Claude, un script
 * en una compu, un workflow que no pasa por una ruta nuestra. Lo que sí corre
 * acá adentro (la sincronización de Meta) anota directo con `registrarCorrida`.
 *
 *   curl -X POST "$APP_URL/api/calendario/corridas" \
 *     -H "Authorization: Bearer $CRON_SECRET" \
 *     -H "content-type: application/json" \
 *     -d '{"clave":"agente-ads","ok":true,"detalle":"3 cambios propuestos"}'
 *
 * Sin sesión: el middleware la deja pasar como ruta exacta y la única llave es
 * el secreto de los crons. Sin el secreto configurado responde 404, igual que
 * el webhook de WhatsApp.
 */
export const POST = ruta("calendario corridas POST", async (req: Request) => {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: "No existe" }, { status: 404 })
  if (!esSecretoDeCron(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }

  if (!esClave(body.clave)) {
    return NextResponse.json({ error: "Falta la clave (ej.: agente-ads)" }, { status: 400 })
  }
  if (typeof body.ok !== "boolean") {
    return NextResponse.json({ error: "Falta ok: true o false" }, { status: 400 })
  }

  const inicio =
    typeof body.inicio === "string" && !Number.isNaN(Date.parse(body.inicio))
      ? new Date(body.inicio).toISOString()
      : undefined

  await registrarCorrida({
    clave: body.clave,
    ok: body.ok,
    detalle: typeof body.detalle === "string" ? body.detalle : null,
    inicio,
    origen: body.origen === "manual" || body.origen === "agente" ? body.origen : "cron",
  })

  return NextResponse.json({ ok: true }, { status: 201 })
})
