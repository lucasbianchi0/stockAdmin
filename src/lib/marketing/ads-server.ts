/**
 * Google Ads → lo que muestra la pestaña de Campañas.
 *
 * Sólo servidor: usa el refresh token de OAuth y el developer token, que no
 * pueden salir del servidor bajo ninguna circunstancia.
 *
 * ── POR QUE SE LEE EN VIVO **Y** SE GUARDA EL CIERRE ──
 *
 * Las dos cosas, porque cada una tapa un agujero de la otra:
 *
 *   · Google reescribe las cifras hasta unos tres días después del hecho. Un
 *     panel que consulta siempre en vivo muestra un agosto que cambia solo, y la
 *     primera vez que alguien lo note deja de creerle a la pantalla.
 *   · El refresh token se vence (ver abajo). Cuando pasa, el panel tiene que
 *     seguir mostrando la historia en lugar de quedar en blanco.
 *
 * Entonces: el mes en curso sale en vivo, los meses cerrados salen de
 * `ads_campanas_mes`, y si la API no contesta se cae a lo guardado sin romper
 * nada.
 *
 * ── EL TOKEN SE VENCE CADA SIETE DIAS, Y NO ES UN BUG NUESTRO ──
 *
 * Google caduca los refresh tokens de las apps de OAuth que están en modo
 * "Testing" en la pantalla de consentimiento. Mientras la app de Accedra siga
 * sin publicar, este módulo va a devolver `token-vencido` una vez por semana.
 * Eso es tolerable cuando lo regenera a mano quien lo configuró; es inaceptable
 * para un panel que el dueño abre cuando se le ocurre. La solución no es código:
 * es publicar la app ("In production") o pasar a una cuenta de servicio.
 *
 * Por eso el error se distingue del resto y tiene su propio texto en pantalla:
 * el día que pase, quien lo lea tiene que saber qué hacer sin preguntar.
 */

import { supabase } from "@/lib/supabase"
import type { Ads, Campana, MotivoSinAds } from "@/lib/marketing/resultados"

/** La versión contra la que está escrita la consulta. Subirla es una decisión. */
const API = "https://googleads.googleapis.com/v25"
const OAUTH = "https://oauth2.googleapis.com/token"

/** Google devuelve importes en millonésimos de la moneda de la cuenta. */
const MICROS = 1_000_000

type Credenciales = {
  developerToken: string
  customerId: string
  loginCustomerId: string | null
  clientId: string
  clientSecret: string
  refreshToken: string
}

/** Los guiones son de la interfaz de Google; la API los rechaza. */
function soloDigitos(v: string): string {
  return v.replace(/\D/g, "")
}

function credenciales(): Credenciales | null {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN
  const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN

  if (!developerToken || !customerId || !clientId || !clientSecret || !refreshToken) return null

  const login = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID
  return {
    developerToken,
    customerId: soloDigitos(customerId),
    // Sólo va si la MCC realmente administra la cuenta. Mandarlo cuando no es
    // así devuelve un 403 que no dice nada útil.
    loginCustomerId: login ? soloDigitos(login) : null,
    clientId,
    clientSecret,
    refreshToken,
  }
}

/* ── Token de acceso ──────────────────────────────────────────────────────── */

/**
 * El access token dura una hora. Se cachea en memoria del proceso: pedir uno
 * nuevo en cada request agrega ~300ms a cada carga del panel y consume cuota de
 * OAuth sin ningún motivo.
 *
 * En Vercel cada instancia tiene su propia copia, y eso está bien: el peor caso
 * es un pedido de token de más por instancia por hora.
 */
let cache: { token: string; vence: number } | null = null

class AdsError extends Error {
  constructor(
    readonly motivo: MotivoSinAds,
    mensaje: string
  ) {
    super(mensaje)
  }
}

async function accessToken(c: Credenciales): Promise<string> {
  // Un minuto de margen: un token que vence mientras viaja el pedido da un 401
  // que después parece un problema de permisos.
  if (cache && cache.vence > Date.now() + 60_000) return cache.token

  const res = await fetch(OAUTH, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.clientId,
      client_secret: c.clientSecret,
      refresh_token: c.refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  })

  const cuerpo = (await res.json().catch(() => ({}))) as {
    access_token?: string
    expires_in?: number
    error?: string
    error_description?: string
  }

  if (!res.ok || !cuerpo.access_token) {
    // `invalid_grant` es exactamente el caso de los siete días. Distinguirlo
    // ahorra la media hora de buscar el problema en el lugar equivocado.
    const vencido = cuerpo.error === "invalid_grant"
    throw new AdsError(
      vencido ? "token-vencido" : "error",
      cuerpo.error_description ?? cuerpo.error ?? `OAuth respondió ${res.status}`
    )
  }

  cache = {
    token: cuerpo.access_token,
    vence: Date.now() + (cuerpo.expires_in ?? 3600) * 1000,
  }
  return cache.token
}

/* ── Consulta ─────────────────────────────────────────────────────────────── */

type FilaAds = {
  campaign?: {
    id?: string
    name?: string
    status?: string
    advertisingChannelType?: string
  }
  metrics?: {
    impressions?: string | number
    clicks?: string | number
    costMicros?: string | number
    conversions?: number
    conversionsValue?: number
  }
}

async function gaql(c: Credenciales, query: string): Promise<FilaAds[]> {
  const token = await accessToken(c)

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "developer-token": c.developerToken,
    "Content-Type": "application/json",
  }
  if (c.loginCustomerId) headers["login-customer-id"] = c.loginCustomerId

  const res = await fetch(`${API}/customers/${c.customerId}/googleAds:searchStream`, {
    method: "POST",
    headers,
    body: JSON.stringify({ query }),
    cache: "no-store",
  })

  if (!res.ok) {
    const detalle = await res.text().catch(() => "")
    if (res.status === 401) {
      // El access token cacheado quedó inservible; el siguiente intento lo pide
      // de nuevo en vez de repetir el mismo error.
      cache = null
      throw new AdsError("token-vencido", "Google rechazó el token de acceso")
    }
    throw new AdsError("error", `Google Ads respondió ${res.status}. ${detalle.slice(0, 300)}`)
  }

  // searchStream devuelve un array de bloques, cada uno con su propio `results`.
  const bloques = (await res.json()) as { results?: FilaAds[] }[]
  return (Array.isArray(bloques) ? bloques : []).flatMap((b) => b.results ?? [])
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

const ESTADO_ES: Record<string, string> = {
  ENABLED: "Activa",
  PAUSED: "Pausada",
  REMOVED: "Eliminada",
}

const CANAL_ES: Record<string, string> = {
  SEARCH: "Búsqueda",
  DISPLAY: "Display",
  VIDEO: "Video",
  SHOPPING: "Shopping",
  PERFORMANCE_MAX: "Performance Max",
}

/* ── En vivo ──────────────────────────────────────────────────────────────── */

/**
 * Las campañas del período, desde la API.
 *
 * Trae también las que no gastaron: una campaña activa en cero es una señal
 * —presupuesto agotado, anuncios rechazados, puja por debajo del piso— y
 * esconderla la vuelve invisible justo cuando hay que mirarla.
 */
export async function campanasEnVivo(desde: string, hasta: string): Promise<Ads> {
  const c = credenciales()
  if (!c) {
    return {
      ok: false,
      motivo: "sin-credenciales",
      detalle: "Faltan las variables GOOGLE_ADS_* en el servidor",
      campanas: await campanasGuardadas(desde, hasta),
    }
  }

  try {
    const filas = await gaql(
      c,
      `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,
              metrics.impressions, metrics.clicks, metrics.cost_micros,
              metrics.conversions, metrics.conversions_value
       FROM campaign
       WHERE segments.date BETWEEN '${desde}' AND '${hasta}'`
    )

    // Una fila por campaña: la API puede devolver varias si el rango abarca
    // segmentos, así que se acumulan en vez de pisarse.
    const porId = new Map<string, Campana>()
    for (const f of filas) {
      const id = f.campaign?.id
      if (!id) continue
      const previa = porId.get(id)
      const campana: Campana = {
        id,
        nombre: f.campaign?.name ?? "(sin nombre)",
        estado: ESTADO_ES[f.campaign?.status ?? ""] ?? f.campaign?.status ?? "—",
        canal: CANAL_ES[f.campaign?.advertisingChannelType ?? ""] ?? f.campaign?.advertisingChannelType ?? "—",
        impresiones: (previa?.impresiones ?? 0) + num(f.metrics?.impressions),
        clics: (previa?.clics ?? 0) + num(f.metrics?.clicks),
        coste: (previa?.coste ?? 0) + num(f.metrics?.costMicros) / MICROS,
        conversiones: (previa?.conversiones ?? 0) + num(f.metrics?.conversions),
        leads: 0,
      }
      porId.set(id, campana)
    }

    const campanas = [...porId.values()].sort((a, b) => b.coste - a.coste)
    return { ok: true, campanas, desde, hasta, enVivo: true }
  } catch (e) {
    const motivo = e instanceof AdsError ? e.motivo : "error"
    console.error("[ads]", e)
    return {
      ok: false,
      motivo,
      detalle: e instanceof Error ? e.message : String(e),
      // Lo guardado es mejor que una pantalla vacía: la historia sigue siendo
      // cierta aunque hoy Google no conteste.
      campanas: await campanasGuardadas(desde, hasta),
    }
  }
}

/* ── Lo guardado ──────────────────────────────────────────────────────────── */

/** El cierre congelado que se haya guardado para los meses del rango. */
export async function campanasGuardadas(desde: string, hasta: string): Promise<Campana[]> {
  const { data, error } = await supabase
    .from("ads_campanas_mes")
    .select("campana_id, campana, estado, canal, impresiones, clics, coste, conversiones")
    .gte("periodo", primerDiaDelMes(desde))
    .lte("periodo", primerDiaDelMes(hasta))

  if (error) {
    console.error("[ads guardadas]", error)
    return []
  }

  const porId = new Map<string, Campana>()
  for (const f of data ?? []) {
    const id = String(f.campana_id)
    const previa = porId.get(id)
    porId.set(id, {
      id,
      nombre: String(f.campana),
      estado: f.estado ? String(f.estado) : "—",
      canal: f.canal ? String(f.canal) : "—",
      impresiones: (previa?.impresiones ?? 0) + num(f.impresiones),
      clics: (previa?.clics ?? 0) + num(f.clics),
      coste: (previa?.coste ?? 0) + num(f.coste),
      conversiones: (previa?.conversiones ?? 0) + num(f.conversiones),
      leads: 0,
    })
  }
  return [...porId.values()].sort((a, b) => b.coste - a.coste)
}

function primerDiaDelMes(fecha: string): string {
  return `${fecha.slice(0, 7)}-01`
}

/**
 * Congela un mes en `ads_campanas_mes`. Lo llama el cron una vez cerrado el mes.
 *
 * Es idempotente: reimportar el mismo mes actualiza las filas en vez de
 * duplicarlas, así que se puede correr dos veces sin pensarlo. Devuelve cuántas
 * campañas guardó, o un error si la API no contestó — no se guarda a medias.
 */
export async function guardarCierre(
  periodo: string
): Promise<{ ok: true; guardadas: number } | { ok: false; detalle: string }> {
  const primero = primerDiaDelMes(periodo)
  const ultimo = new Date(Number(primero.slice(0, 4)), Number(primero.slice(5, 7)), 0)
  const hasta = `${primero.slice(0, 7)}-${String(ultimo.getDate()).padStart(2, "0")}`

  const ads = await campanasEnVivo(primero, hasta)
  if (!ads.ok) return { ok: false, detalle: ads.detalle }

  const filas = ads.campanas.map((c) => ({
    periodo: primero,
    campana_id: c.id,
    campana: c.nombre,
    estado: c.estado,
    canal: c.canal,
    impresiones: c.impresiones,
    clics: c.clics,
    coste: c.coste,
    conversiones: c.conversiones,
    actualizado_en: new Date().toISOString(),
  }))

  if (filas.length === 0) return { ok: true, guardadas: 0 }

  const { error } = await supabase
    .from("ads_campanas_mes")
    .upsert(filas, { onConflict: "periodo,campana_id" })

  if (error) return { ok: false, detalle: error.message }
  return { ok: true, guardadas: filas.length }
}
