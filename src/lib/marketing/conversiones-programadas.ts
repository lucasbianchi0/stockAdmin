import { timingSafeEqual } from "node:crypto"
import { NextResponse } from "next/server"

import { colaDeContactos, csvDeConversiones } from "@/lib/marketing/ads-server"

/**
 * El archivo que Google Ads viene a buscar solo, todos los días.
 *
 * Lo sirven dos rutas con el mismo contenido:
 *
 *   · `/api/marketing/conversiones/programada` — la original, para la vieja
 *     pantalla Objetivos → Subidas → Programar. Lleva la línea `Parameters:`.
 *   · `/api/marketing/conversiones/contactos.csv` — para el Administrador de
 *     datos, que es adonde Google movió las subidas en 2026. Ése rechaza toda
 *     URL que no termine en `.csv` ("No se puede leer el formato de archivo") y
 *     quiere los encabezados en la primera fila, así que va sin `Parameters:`.
 *
 * Ver `app/api/marketing/conversiones/programada/route.ts` para el porqué de la
 * subida programada y de la puerta Basic.
 */

const USUARIO = "google-ads"

function igual(recibido: string, esperado: string): boolean {
  const a = Buffer.from(recibido)
  const b = Buffer.from(esperado)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function respuestaProgramada(req: Request, { parametros }: { parametros: boolean }): Promise<Response> {
  const clave = process.env.CONVERSIONES_PROGRAMADAS_CLAVE
  if (!clave) return new NextResponse("Not found", { status: 404 })

  const [esquema, credencial] = (req.headers.get("authorization") ?? "").split(" ")
  const [usuario, ...resto] =
    esquema?.toLowerCase() === "basic" && credencial ? Buffer.from(credencial, "base64").toString("utf8").split(":") : []

  if (usuario !== USUARIO || !igual(resto.join(":"), clave)) {
    return new NextResponse("No autorizado", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="conversiones"' },
    })
  }

  const c = await colaDeContactos()
  // Un error se contesta como error y no como archivo vacío: Google marca la
  // ejecución como fallida y se ve en el historial de subidas. Un CSV vacío
  // pasaría por "todo bien, no hubo nada".
  if (!c.ok) return new NextResponse(c.error, { status: 500 })

  return new NextResponse(csvDeConversiones(c.filas, { parametros }), {
    headers: { "content-type": "text/csv; charset=utf-8", "cache-control": "no-store" },
  })
}
