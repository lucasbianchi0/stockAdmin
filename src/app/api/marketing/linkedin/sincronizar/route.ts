import { NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"

import { sesionConModulo } from "@/lib/sesion-server"
import type { ResumenSincronizacion } from "@/lib/marketing/linkedin"
import { sincronizarLinkedin, windsorConfigurado } from "@/lib/marketing/linkedin-windsor"

/**
 * Trae de Windsor.ai la analítica de la página de LinkedIn y la guarda.
 *
 * Lo llama el cron diario de GitHub Actions (`.github/workflows/linkedin.yml`)
 * y el botón "Actualizar ahora" de Resultados → LinkedIn. Acepta las dos
 * autorizaciones, como la sincronización de Instagram y Facebook: el secreto
 * del cron o un usuario con el módulo de marketing.
 */

// La primera corrida trae el año entero; las siguientes, una semana.
export const maxDuration = 60

function secretoValido(recibido: string, esperado: string): boolean {
  const a = Buffer.from(recibido)
  const b = Buffer.from(esperado)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function POST(req: Request) {
  const esperado = process.env.CRON_SECRET
  const recibido = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? ""
  const esCron = Boolean(esperado) && secretoValido(recibido, esperado!)

  let quien = "Automático"
  if (!esCron) {
    const s = await sesionConModulo(["marketing"])
    if ("respuesta" in s) return s.respuesta
    quien = s.sesion.nombre
  }

  if (!windsorConfigurado()) {
    return NextResponse.json({ error: "LinkedIn todavía no está conectado (falta la clave de Windsor.ai)" }, { status: 409 })
  }

  const partes = await sincronizarLinkedin(quien)
  const resumen: ResumenSincronizacion = { partes }
  return NextResponse.json(resumen, { status: partes.every((p) => !p.ok) ? 502 : 200 })
}
