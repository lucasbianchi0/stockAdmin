import { timingSafeEqual } from "node:crypto"
import { NextResponse } from "next/server"

import { ruta } from "@/lib/admin/ruta"
import { colaDeContactos, csvDeConversiones } from "@/lib/marketing/ads-server"

/**
 * El archivo que Google Ads viene a buscar solo, todos los días.
 *
 * ── POR QUE EXISTE ──
 *
 * Google cerró la subida de conversiones por API a esta cuenta
 * (`CUSTOMER_NOT_ALLOWLISTED_FOR_THIS_FEATURE`, 13/9/2026), y un botón que
 * alguien tiene que apretar es donde la medición muere. La subida programada de
 * Google Ads (Objetivos → Subidas → Programar, fuente HTTPS) lee esta dirección
 * una vez por día y carga lo que encuentra. No hace falta que nadie haga nada.
 *
 * ── QUE DEVUELVE ──
 *
 * Sólo los clics a WhatsApp, teléfono o mail de gente que vino de un anuncio,
 * como `Contacto directo`, de los últimos 90 días. Todos, cada vez: Google
 * ignora una fila con el mismo gclid, nombre y hora que ya recibió, así que
 * repetirlas no duplica.
 *
 * Las consultas del formulario NO van acá. Esas las revisa una persona antes de
 * decirle a Google que valen — ver `../route.ts`.
 *
 * ── LA PUERTA ──
 *
 * El middleware la deja pasar sin sesión porque Google no tiene una. La
 * protección es ésta: usuario y contraseña por Basic, que es lo que acepta la
 * fuente HTTPS de Google Ads. Sin `CONVERSIONES_PROGRAMADAS_CLAVE` configurada
 * la ruta contesta 404: abierta sin contraseña sería peor que no existir.
 */

const USUARIO = "google-ads"

function igual(recibido: string, esperado: string): boolean {
  const a = Buffer.from(recibido)
  const b = Buffer.from(esperado)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export const GET = ruta("conversiones programadas", async (req) => {
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

  return new NextResponse(csvDeConversiones(c.filas), {
    headers: { "content-type": "text/csv; charset=utf-8", "cache-control": "no-store" },
  })
})
