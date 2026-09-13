import { NextResponse } from "next/server"

import { ruta } from "@/lib/admin/ruta"
import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { esEstado, ESTADO_LABEL } from "@/lib/marketing/resultados"

/**
 * Cambiar el estado de un lead y, si se ganó, cuánto.
 *
 * ── ESTO ES LO UNICO QUE SE ESCRIBE EN TODO EL PANEL ──
 *
 * Y es la pieza que lo sostiene. Sin alguien marcando ganado o perdido, las
 * otras tres pestañas miden formularios completados, no negocio — y optimizar
 * por formularios completados es exactamente lo que dejó esta cuenta con
 * 712.276 ARS gastados y siete conversiones que no vinieron de la web.
 *
 * Además es la única fuente posible de las conversiones offline: sin `closed_at`
 * no hay nada que subirle a Google, y Smart Bidding sigue buscando gente que
 * completa formularios en lugar de empresas que firman.
 */

/**
 * `closed_at` lo escribe el servidor, no el cliente.
 *
 * Es la fecha que después decide qué conversiones se suben a Google y con qué
 * marca temporal. Dejarla en manos del navegador sería aceptar el reloj de la
 * computadora de quien carga —que puede estar corrido— en un dato que Google
 * rechaza si no cae dentro de la ventana de conversión.
 */
const CERRADOS = new Set(["ganado", "perdido", "descartado"])

export const PATCH = ruta("lead PATCH", async (req, ctx: { params: Promise<{ id: string }> }) => {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const { id } = await ctx.params
  const raw = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!raw) return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 })

  const parche: Record<string, unknown> = {}

  if ("estado" in raw) {
    if (!esEstado(raw.estado)) {
      return NextResponse.json(
        { error: `Estado desconocido. Los válidos son: ${Object.values(ESTADO_LABEL).join(", ")}` },
        { status: 400 }
      )
    }
    parche.status = raw.estado
    parche.closed_at = CERRADOS.has(raw.estado) ? new Date().toISOString() : null
  }

  if ("monto" in raw) {
    const v = raw.monto
    if (v === null || v === "") {
      parche.deal_value = null
    } else {
      const n = typeof v === "number" ? v : Number(v)
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json({ error: "El monto tiene que ser un número positivo" }, { status: 400 })
      }
      parche.deal_value = n
    }
  }

  if ("moneda" in raw) {
    const m = typeof raw.moneda === "string" ? raw.moneda.toUpperCase() : ""
    if (m !== "ARS" && m !== "USD") {
      return NextResponse.json({ error: "La moneda tiene que ser ARS o USD" }, { status: 400 })
    }
    parche.deal_currency = m
  }

  if ("notas" in raw) {
    parche.notes = typeof raw.notas === "string" ? raw.notas.slice(0, 4000) : null
  }

  if (Object.keys(parche).length === 0) {
    return NextResponse.json({ error: "No hay nada para cambiar" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("leads")
    .update(parche)
    .eq("id", id)
    .select("id, status, deal_value, deal_currency, closed_at, notes")
    .maybeSingle()

  if (error) {
    console.error("[lead PATCH]", error)
    return NextResponse.json({ error: "No se pudo guardar el cambio" }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: "Ese lead no existe" }, { status: 404 })

  return NextResponse.json({ lead: data })
})
