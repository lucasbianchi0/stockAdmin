import { NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"

import { ruta } from "@/lib/admin/ruta"
import { exigirModulo } from "@/lib/guard-api"
import { guardarCierre } from "@/lib/marketing/ads-server"

/**
 * Congela un mes de Google Ads en `ads_campanas_mes`.
 *
 * Lo llama el cron el día 3 de cada mes con el mes anterior. El 3 y no el 1 por
 * un motivo concreto: Google sigue reescribiendo las cifras hasta unos tres días
 * después del hecho, así que congelar el día 1 guarda un número que después
 * cambia — y el panel quedaría mostrando un agosto distinto del que muestra
 * Google, sin que nadie pueda explicar cuál de los dos miente.
 *
 * Acepta las dos autorizaciones, igual que el tick de publicación: el secreto
 * del cron —que no tiene sesión ni la puede tener— o un usuario con el módulo de
 * marketing, para poder rehacer un mes a mano cuando haga falta.
 *
 * Es POST y no GET porque escribe. Un GET termina precargado por algún cliente,
 * algún día.
 */

function secretoValido(recibido: string, esperado: string): boolean {
  const a = Buffer.from(recibido)
  const b = Buffer.from(esperado)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/** El mes anterior al de hoy, en formato `YYYY-MM-01`. */
function mesAnterior(hoy = new Date()): string {
  const d = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`
}

export const POST = ruta("cerrar mes de ads", async (req) => {
  const esperado = process.env.CRON_SECRET
  const recibido = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? ""

  const porCron = Boolean(esperado && recibido && secretoValido(recibido, esperado))
  if (!porCron) {
    const sinPermiso = await exigirModulo("marketing")
    if (sinPermiso) return sinPermiso
  }

  const url = new URL(req.url)
  const pedido = url.searchParams.get("periodo")
  // Se valida el formato aunque venga de adentro: un `periodo` malformado
  // terminaría guardando filas con una fecha absurda que después nadie entiende.
  const periodo = pedido && /^\d{4}-\d{2}(-\d{2})?$/.test(pedido) ? `${pedido.slice(0, 7)}-01` : mesAnterior()

  const r = await guardarCierre(periodo)
  if (!r.ok) {
    return NextResponse.json({ error: `No se pudo cerrar ${periodo}: ${r.detalle}` }, { status: 502 })
  }

  return NextResponse.json({ periodo, guardadas: r.guardadas })
})
