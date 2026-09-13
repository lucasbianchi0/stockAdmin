import { NextResponse } from "next/server"

import { ruta } from "@/lib/admin/ruta"
import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { csvDeConversiones, subirConversiones, type ConversionASubir } from "@/lib/marketing/ads-server"

/**
 * Le informa a Google qué clics terminaron en una consulta o en un contrato.
 *
 * ── POR QUE ESTO EXISTE, SI YA HAY UN SCRIPT ──
 *
 * `accedra/scripts/ads/conversiones-offline.mjs` arma el CSV y después alguien
 * lo sube a mano. Funciona, pero el paso manual es donde muere: entre abrir la
 * terminal, correr el script, encontrar el archivo y subirlo, pasa un mes y no
 * lo hizo nadie. Acá el mismo trabajo son dos clics desde la bandeja.
 *
 * ── POR QUE NO ES UN CRON ──
 *
 * La decisión de informarle a Google que un lead vale la toma alguien que miró
 * ese lead. Subir automáticamente todo lo que entra es volver a enseñarle a
 * comprar formularios completados, que es justo lo que esta vía evita.
 *
 * ── POR QUE HAY DOS CAMINOS ──
 *
 * El 13/9/2026, probando contra la cuenta real, Google contestó
 * `CUSTOMER_NOT_ALLOWLISTED_FOR_THIS_FEATURE`: cerró
 * `UploadClickConversions` a integraciones nuevas y manda a la Data Manager
 * API, que pide un permiso de OAuth que este token no tiene.
 *
 * Así que `revisar` pregunta primero. Si la API está abierta, se sube por ahí.
 * Si no, se arma el CSV —que la interfaz de Google sigue aceptando— y el sello
 * queda para cuando la persona confirme que lo subió.
 *
 * ── LO IRREVERSIBLE ──
 *
 * Una conversión aceptada por Google no se puede borrar, y una subida dos veces
 * cuenta dos veces. Por eso `conversion_uploaded_at` se escribe DESPUES de que
 * Google aceptó, nunca antes: al revés, un fallo dejaría esas conversiones
 * fuera de la cola para siempre.
 */

/** El tope de un lote. Google acepta 2000; con este volumen sobra de lejos. */
const MAX = 200

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

/**
 * La cola, ya sin nada nuestro.
 *
 * El filtro del equipo no es una comodidad: subir una prueba propia le enseña a
 * Smart Bidding a comprar clics que nunca fueron clientes, y no se deshace.
 * Verificado el 13/9/2026: de los tres leads de la base con `gclid`, los tres
 * eran direcciones nuestras — dos de ellas ni figuraban en la lista, las agarró
 * la regla de dominio.
 *
 * Si la verificación no se puede hacer, se aborta. Es preferible no subir nada a
 * subir de más.
 */
async function cola(soloGanados: boolean): Promise<
  { ok: true; filas: ConversionASubir[]; descartadas: number } | { ok: false; error: string }
> {
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
    console.error("[conversiones cola]", error)
    return { ok: false, error: "No se pudo leer la cola" }
  }

  const candidatos = (data ?? []) as LeadPendiente[]
  if (candidatos.length === 0) return { ok: true, filas: [], descartadas: 0 }

  const { data: equipoData, error: errEquipo } = await supabase.rpc("es_del_equipo_lote", {
    p_emails: candidatos.map((c) => c.email),
  })
  if (errEquipo) {
    console.error("[conversiones equipo]", errEquipo)
    return { ok: false, error: "No se pudo verificar qué leads son del equipo. No se subió nada." }
  }
  const esEquipo = new Set(((equipoData ?? []) as { email: string }[]).map((f) => f.email.toLowerCase()))

  const sesiones = [...new Set(candidatos.map((c) => c.session_id).filter(Boolean))] as string[]
  const internas = new Set<string>()
  if (sesiones.length > 0) {
    const { data: ses, error: errSes } = await supabase.from("sessions").select("id, is_internal").in("id", sesiones)
    if (errSes) {
      console.error("[conversiones sesiones]", errSes)
      return { ok: false, error: "No se pudo verificar el tráfico interno. No se subió nada." }
    }
    for (const s of ses ?? []) if (s.is_internal) internas.add(String(s.id))
  }

  // Los leads sin `session_id` NO se descartan: la sesión se pierde por
  // bloqueadores o pestañas cerradas, y un lead legítimo no debe caerse por eso.
  const limpios = candidatos.filter(
    (c) => !esEquipo.has(c.email.toLowerCase()) && !(c.session_id && internas.has(c.session_id))
  )

  return {
    ok: true,
    descartadas: candidatos.length - limpios.length,
    filas: limpios.map((l) => ({
      leadId: l.id,
      gclid: l.gclid as string,
      // El momento de la conversión es el cierre si existe; si no, la consulta.
      // Tiene que caer después del clic y dentro de la ventana de la acción, o
      // Google descarta la fila.
      cuando: l.closed_at ?? l.created_at,
      valor: l.deal_value,
      moneda: l.deal_currency,
    })),
  }
}

/** Escribe el sello. Sólo se llama cuando Google ya aceptó. */
async function sellar(ids: string[]): Promise<string | null> {
  if (ids.length === 0) return null
  const { error } = await supabase
    .from("leads")
    .update({ conversion_uploaded_at: new Date().toISOString() })
    .in("id", ids)
  return error ? error.message : null
}

export const POST = ruta("conversiones", async (req) => {
  const sinPermiso = await exigirModulo("marketing")
  if (sinPermiso) return sinPermiso

  const cuerpo = (await req.json().catch(() => ({}))) as {
    accion?: "revisar" | "subir" | "csv" | "marcar"
    soloGanados?: boolean
    ids?: unknown
  }
  const accion = cuerpo.accion ?? "revisar"
  // Por defecto sólo los cerrados como ganados: eso es lo que le enseña a Google
  // qué clics valen. `soloGanados: false` sirve para el arranque, cuando todavía
  // no hay contratos y hace falta darle ALGUNA señal al algoritmo.
  const soloGanados = cuerpo.soloGanados !== false

  /* ── Marcar: el cierre del camino por CSV ───────────────────────────────── */

  if (accion === "marcar") {
    const pedidos = Array.isArray(cuerpo.ids) ? cuerpo.ids.filter((x): x is string => typeof x === "string" && UUID.test(x)) : []
    if (pedidos.length === 0) return NextResponse.json({ error: "No hay nada para marcar" }, { status: 400 })

    // Se recalcula la cola en vez de confiar en los ids que manda el cliente:
    // sellar un lead que no estaba pendiente lo sacaría de la cola sin que nadie
    // lo haya subido a ningún lado.
    const c = await cola(soloGanados)
    if (!c.ok) return NextResponse.json({ error: c.error }, { status: 500 })

    const validos = new Set(c.filas.map((f) => f.leadId))
    const aSellar = pedidos.filter((id) => validos.has(id))

    const err = await sellar(aSellar)
    if (err) return NextResponse.json({ error: `No se pudieron marcar: ${err}` }, { status: 500 })
    return NextResponse.json({ accion: "marcar", marcadas: aSellar.length })
  }

  /* ── Los otros tres comparten la cola ───────────────────────────────────── */

  const c = await cola(soloGanados)
  if (!c.ok) return NextResponse.json({ error: c.error }, { status: 500 })

  if (c.filas.length === 0) {
    return NextResponse.json({ accion, viaApi: false, listas: 0, subidas: 0, descartadas: c.descartadas, rechazadas: [], ids: [] })
  }

  if (accion === "csv") {
    return NextResponse.json({
      accion: "csv",
      csv: csvDeConversiones(c.filas),
      ids: c.filas.map((f) => f.leadId),
      filas: c.filas.length,
      descartadas: c.descartadas,
    })
  }

  const r = await subirConversiones(c.filas, { validar: accion === "revisar" })

  // La API cerrada no es un error a mostrar: es la señal de que hay que ir por
  // el CSV. La pantalla cambia de botón con esto.
  if (r.sinPermisoDeApi) {
    return NextResponse.json({
      accion,
      viaApi: false,
      listas: c.filas.length,
      subidas: 0,
      descartadas: c.descartadas,
      rechazadas: [],
      ids: c.filas.map((f) => f.leadId),
      nota: r.detalle,
    })
  }

  if (!r.ok) return NextResponse.json({ error: r.detalle ?? "Google no aceptó la subida" }, { status: 502 })

  if (accion === "revisar") {
    return NextResponse.json({
      accion: "revisar",
      viaApi: true,
      listas: r.subidas,
      subidas: 0,
      descartadas: c.descartadas,
      rechazadas: r.rechazadas,
      ids: c.filas.map((f) => f.leadId),
    })
  }

  const rechazados = new Set(r.rechazadas.map((x) => x.leadId))
  const err = await sellar(c.filas.filter((f) => !rechazados.has(f.leadId)).map((f) => f.leadId))
  if (err) {
    // Google ya las tiene. Avisar es lo único correcto: reintentar sin el sello
    // las subiría dos veces.
    console.error("[conversiones sello]", err)
    return NextResponse.json(
      {
        error:
          "Google aceptó las conversiones pero no se pudieron marcar como subidas. NO vuelvas a subir: se duplicarían.",
        subidas: r.subidas,
      },
      { status: 500 }
    )
  }

  return NextResponse.json({
    accion: "subir",
    viaApi: true,
    listas: r.subidas,
    subidas: r.subidas,
    descartadas: c.descartadas,
    rechazadas: r.rechazadas,
    ids: [],
  })
})
