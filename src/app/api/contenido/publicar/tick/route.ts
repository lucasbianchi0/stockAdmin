import { NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"

import { exigirModulo } from "@/lib/guard-api"
import { tickDePublicacion } from "@/lib/publicar/publicar-server"

/**
 * El tick de publicación: saca de la cola lo que ya venció y lo publica.
 *
 * Lo llama el cron de GitHub Actions cada quince minutos, y también la UI cuando
 * alguien quiere adelantar una pieza sin esperar. Por eso acepta dos
 * autorizaciones distintas: el secreto del cron —que no tiene sesión ni la puede
 * tener— o un usuario con el módulo de marketing. Cualquier otra cosa es un 401.
 *
 * Que sea POST y no GET no es formalismo: esto publica. Un GET termina siendo
 * precargado por algún cliente, algún día.
 */

// Cinco piezas por tick, cada una con una subida de imagen de por medio. Sesenta
// segundos es el techo del plan hobby de Vercel; si un tick lo roza, lo que
// corresponde es bajar POR_TICK, no subir esto.
export const maxDuration = 60

/**
 * Comparación en tiempo constante.
 *
 * Un `===` sobre un secreto se puede atacar midiendo cuánto tarda en fallar, y
 * este endpoint publica en las redes de la empresa. Cuesta cuatro líneas.
 */
function secretoValido(recibido: string, esperado: string): boolean {
  const a = Buffer.from(recibido)
  const b = Buffer.from(esperado)
  // timingSafeEqual tira si los largos difieren, y ese tiro ya filtra el largo.
  // Comparar los largos aparte y salir es equivalente y no revienta.
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

  try {
    const resultados = await tickDePublicacion()

    return NextResponse.json({
      publicadas: resultados.filter((r) => r.ok).length,
      fallidas: resultados.filter((r) => !r.ok).length,
      resultados,
    })
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "Error al publicar"
    console.error("[publicar tick]", mensaje)
    return NextResponse.json({ error: mensaje }, { status: 500 })
  }
}
