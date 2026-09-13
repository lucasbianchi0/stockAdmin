import { NextResponse } from "next/server"

import { ruta } from "@/lib/admin/ruta"
import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { subirConversiones, type ConversionASubir } from "@/lib/marketing/ads-server"

/**
 * Le informa a Google qué clics terminaron en una consulta o en un contrato.
 *
 * ── POR QUE ESTO EXISTE, SI YA HAY UN SCRIPT ──
 *
 * `accedra/scripts/ads/conversiones-offline.mjs` arma el CSV y después alguien
 * lo sube a mano por la interfaz de Google. Funciona, pero el paso manual es
 * donde muere: entre exportar, abrir Ads, encontrar Objetivos → Subidas y
 * arrastrar el archivo, pasa un mes y no lo hizo nadie.
 *
 * Esto hace lo mismo por la API, desde la bandeja. Lo que NO hace es
 * automatizarlo con un cron, y es a propósito: la decisión de informarle a
 * Google que un lead vale la tiene que tomar una persona que miró ese lead.
 * Subir automáticamente todo lo que entra convierte esto otra vez en "comprar
 * formularios completados", que es justo lo que esta vía viene a evitar.
 *
 * ── LO IRREVERSIBLE ──
 *
 * Una conversión aceptada por Google no se puede borrar. Por eso hay dos pasos:
 * `POST` sin `confirmar` valida contra Google sin escribir nada y devuelve qué
 * entraría; con `confirmar: true` sube de verdad.
 *
 * Y por eso el sello se escribe DESPUES de que Google aceptó, nunca antes: si se
 * sellara primero y la subida fallara, esas conversiones no volverían a aparecer
 * en la cola nunca más.
 */

/** El tope de un lote. Google acepta 2000; con este volumen sobra de lejos. */
const MAX = 200

type LeadPendiente = {
  id: string
  created_at: string
  closed_at: string | null
  gclid: string | null
  deal_value: number | null
  deal_currency: string | null
  status: string
  email: string
  session_id: string | null
}

export const POST = ruta("subir conversiones", async (req) => {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const cuerpo = (await req.json().catch(() => ({}))) as { confirmar?: boolean; soloGanados?: boolean }
  const confirmar = cuerpo.confirmar === true
  // Por defecto sólo los cerrados como ganados: eso es lo que le enseña a Google
  // qué clics valen. Todas las consultas sirve para el arranque, cuando todavía
  // no hay contratos y hace falta darle ALGUNA señal al algoritmo.
  const soloGanados = cuerpo.soloGanados !== false

  let query = supabase
    .from("leads")
    .select("id, created_at, closed_at, gclid, deal_value, deal_currency, status, email, session_id")
    .not("gclid", "is", null)
    .is("conversion_uploaded_at", null)
    .order("created_at", { ascending: true })
    .limit(MAX)

  if (soloGanados) query = query.eq("status", "ganado")

  const { data, error } = await query
  if (error) {
    console.error("[conversiones]", error)
    return NextResponse.json({ error: "No se pudo leer la cola" }, { status: 500 })
  }

  const candidatos = (data ?? []) as LeadPendiente[]
  if (candidatos.length === 0) {
    return NextResponse.json({ confirmado: confirmar, listas: 0, subidas: 0, descartadas: 0, rechazadas: [] })
  }

  /* ── El filtro que no se puede saltear ─────────────────────────────────── */

  // Se descarta todo lo que sea nuestro, por mail y por sesión interna. Subir
  // una prueba del equipo le enseña a Smart Bidding a comprar clics que nunca
  // fueron clientes — el mismo error que ya costó caro en esta cuenta— y una vez
  // aceptada no se deshace. Si la verificación falla, se aborta: es preferible
  // no subir nada a subir de más.
  const { data: equipoData, error: errEquipo } = await supabase.rpc("es_del_equipo_lote", {
    p_emails: candidatos.map((c) => c.email),
  })

  let esEquipo: Set<string>
  if (errEquipo) {
    console.error("[conversiones equipo]", errEquipo)
    return NextResponse.json(
      { error: "No se pudo verificar qué leads son del equipo. No se subió nada." },
      { status: 500 }
    )
  } else {
    esEquipo = new Set(((equipoData ?? []) as { email: string }[]).map((f) => f.email.toLowerCase()))
  }

  const sesiones = [...new Set(candidatos.map((c) => c.session_id).filter(Boolean))] as string[]
  const internas = new Set<string>()
  if (sesiones.length > 0) {
    const { data: ses, error: errSes } = await supabase
      .from("sessions")
      .select("id, is_internal")
      .in("id", sesiones)
    if (errSes) {
      console.error("[conversiones sesiones]", errSes)
      return NextResponse.json(
        { error: "No se pudo verificar el tráfico interno. No se subió nada." },
        { status: 500 }
      )
    }
    for (const s of ses ?? []) if (s.is_internal) internas.add(String(s.id))
  }

  // Los leads sin `session_id` NO se descartan: la sesión se pierde por
  // bloqueadores o pestañas cerradas, y un lead legítimo no debe caerse por eso.
  const limpios = candidatos.filter(
    (c) => !esEquipo.has(c.email.toLowerCase()) && !(c.session_id && internas.has(c.session_id))
  )
  const descartadas = candidatos.length - limpios.length

  const filas: ConversionASubir[] = limpios.map((l) => ({
    leadId: l.id,
    gclid: l.gclid as string,
    // El momento de la conversión es el cierre si existe; si no, la consulta.
    // Tiene que caer después del clic y dentro de la ventana de la acción, o
    // Google descarta la fila.
    cuando: l.closed_at ?? l.created_at,
    valor: l.deal_value,
    moneda: l.deal_currency,
  }))

  if (filas.length === 0) {
    return NextResponse.json({ confirmado: confirmar, listas: 0, subidas: 0, descartadas, rechazadas: [] })
  }

  const r = await subirConversiones(filas, { validar: !confirmar })
  if (!r.ok) {
    return NextResponse.json({ error: r.detalle ?? "Google no aceptó la subida" }, { status: 502 })
  }

  // Sin confirmar no se sella nada: fue una validación.
  if (!confirmar) {
    return NextResponse.json({
      confirmado: false,
      listas: r.subidas,
      subidas: 0,
      descartadas,
      rechazadas: r.rechazadas,
    })
  }

  const rechazados = new Set(r.rechazadas.map((x) => x.leadId))
  const aSellar = filas.filter((f) => !rechazados.has(f.leadId)).map((f) => f.leadId)

  if (aSellar.length > 0) {
    const { error: errSello } = await supabase
      .from("leads")
      .update({ conversion_uploaded_at: new Date().toISOString() })
      .in("id", aSellar)

    if (errSello) {
      // Google ya las tiene. Avisar es lo único correcto: reintentar sin el
      // sello las subiría dos veces.
      console.error("[conversiones sello]", errSello)
      return NextResponse.json(
        {
          error:
            "Google aceptó las conversiones pero no se pudieron marcar como subidas. NO vuelvas a subir: se duplicarían.",
          subidas: r.subidas,
        },
        { status: 500 }
      )
    }
  }

  return NextResponse.json({
    confirmado: true,
    listas: r.subidas,
    subidas: r.subidas,
    descartadas,
    rechazadas: r.rechazadas,
  })
})
