import { NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"

import { exigirModulo } from "@/lib/guard-api"
import { REDES, type ResumenSincronizacion } from "@/lib/marketing/redes"
import { sincronizarRed } from "@/lib/marketing/redes-server"
import { registrarCorrida } from "@/lib/calendario-equipo-server"

/**
 * Trae de Meta las métricas de Instagram y Facebook y las guarda.
 *
 * Lo llama el cron diario de GitHub Actions (`.github/workflows/redes.yml`) y
 * también el botón "Actualizar ahora" de la pantalla. Por eso acepta las dos
 * autorizaciones, igual que el tick de publicación: el secreto del cron o un
 * usuario con el módulo de marketing.
 *
 * Una red caída no frena a la otra: cada una registra su propio resultado.
 */

// Dos redes con unas cincuenta publicaciones cada una, una llamada de insights
// por publicación. Entra holgado en los 60 segundos del plan hobby.
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

  if (!esCron) {
    const sinPermiso = await exigirModulo("marketing")
    if (sinPermiso) return sinPermiso
  }

  const resultados = await Promise.all(REDES.map((r) => sincronizarRed(r, esCron ? "cron" : "manual")))
  const resumen: ResumenSincronizacion = { resultados }
  // Que una cuenta todavía no esté conectada no es un error del cron.
  const fallo = resultados.some((r) => !r.ok && r.detalle !== "Cuenta sin conectar")
  // Para el Calendario: la corrida del proceso `redes-meta`, con lo que trajo
  // cada red o por qué no.
  await registrarCorrida({
    clave: "redes-meta",
    ok: !fallo,
    detalle: resultados.map((r) => `${r.red}: ${r.ok ? `${r.publicaciones} publicaciones` : r.detalle}`).join(" · "),
    origen: esCron ? "cron" : "manual",
  })
  return NextResponse.json(resumen, { status: fallo ? 502 : 200 })
}
