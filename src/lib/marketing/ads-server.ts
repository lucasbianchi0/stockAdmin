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
    // En esta cuenta NO es opcional. El usuario del token llega a 300-886-7811 a
    // través de la MCC 176-724-6088, no directo: sin este header Google contesta
    // 403 USER_PERMISSION_DENIED. (Comprobado el 13/9/2026; la nota del .env del
    // MCP que dice "no descomentar, la MCC está vacía" quedó vieja — hoy la
    // administra de verdad.) Donde el usuario sí tenga acceso directo, mandarlo
    // igual devuelve un 403 distinto, así que sigue siendo opcional por diseño.
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

/* ══════════════════════════════════════════════════════════════════════════
   Clics → campaña
   ══════════════════════════════════════════════════════════════════════════ */

export type ClicResuelto = { campanaId: string; campana: string; grupo: string | null }

/**
 * Resuelve cada `gclid` a la campaña y el grupo que lo trajeron.
 *
 * ── POR QUE ESTO Y NO UTMs EN LAS URLs DE LOS ANUNCIOS ──
 *
 * El camino obvio para saber de qué campaña vino un lead es agregarle
 * `utm_campaign` a la URL final de cada anuncio. Funciona, pero implica tocar
 * los anuncios que están corriendo —y una plantilla de seguimiento mal escrita
 * deja la cuenta entera sirviendo 404 sin que nadie se entere hasta que el
 * gasto del día ya se fue—.
 *
 * `click_view` da lo mismo sin tocar nada: es de sólo lectura, funciona hacia
 * atrás sobre los clics que ya pasaron, y no depende de que alguien se acuerde
 * de poner el UTM en el anuncio nuevo del mes que viene.
 *
 * ── LOS DOS LIMITES, QUE SON REALES ──
 *
 *   · Google sólo conserva `click_view` 90 días. Más atrás, un lead se sigue
 *     sabiendo "de Ads" —el gclid está en nuestra base para siempre— pero no de
 *     qué campaña.
 *   · La consulta exige UN día exacto por vez. Por eso se agrupa por fecha y se
 *     hace una consulta por día con clics, no una por lead.
 */
export async function campanaDeClics(
  clics: { gclid: string; fecha: string }[]
): Promise<Map<string, ClicResuelto>> {
  const mapa = new Map<string, ClicResuelto>()
  const c = credenciales()
  if (!c || clics.length === 0) return mapa

  // Los que ya quedaron fuera de la ventana no se consultan: la respuesta sería
  // vacía igual y cada consulta cuesta una llamada a la API.
  const corte = new Date()
  corte.setDate(corte.getDate() - 89)

  const buscados = new Set(clics.map((x) => x.gclid))
  const porDia = new Map<string, true>()
  for (const x of clics) {
    const dia = x.fecha.slice(0, 10)
    if (new Date(dia) >= corte) porDia.set(dia, true)
  }

  for (const dia of porDia.keys()) {
    try {
      const filas = (await gaql(
        c,
        `SELECT click_view.gclid, campaign.id, campaign.name, ad_group.name
         FROM click_view
         WHERE segments.date = '${dia}'`
      )) as (FilaAds & { clickView?: { gclid?: string }; adGroup?: { name?: string } })[]

      for (const f of filas) {
        const g = f.clickView?.gclid
        if (!g || !buscados.has(g)) continue
        mapa.set(g, {
          campanaId: f.campaign?.id ?? "",
          campana: f.campaign?.name ?? "",
          grupo: f.adGroup?.name ?? null,
        })
      }
    } catch (e) {
      // Un día que falle no puede tirar abajo la pantalla: el resto de los leads
      // se resuelve igual y los de ese día quedan sin campaña, que es el mismo
      // estado que tenían antes.
      console.error(`[click_view ${dia}]`, e)
    }
  }

  return mapa
}

/* ══════════════════════════════════════════════════════════════════════════
   Conversiones sin conexión
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * La acción de conversión que recibe las subidas. Ya existe en la cuenta, es
 * `UPLOAD_CLICKS` y está marcada como principal.
 *
 * El id va acá y no en una variable de entorno porque es de esta cuenta y de
 * esta acción: una variable sugeriría que se puede apuntar a otra, y apuntar a
 * la equivocada es un error silencioso —Google acepta la subida y la descarta—.
 */
const ACCION_CONVERSION = "7733887838"

/**
 * El nombre, para el CSV. Tiene que coincidir carácter por carácter con el de
 * Google: si no coincide, la subida se acepta y descarta las filas en silencio
 * — el error más difícil de detectar de todo este flujo.
 */
export const NOMBRE_CONVERSION = "Consulta calificada"

/**
 * La acción que recibe los clics a WhatsApp, teléfono y mail. Creada el
 * 13/9/2026, también `UPLOAD_CLICKS` y principal. Va aparte de la consulta: un
 * clic al botón no garantiza que la persona haya escrito, y mezclarlos le haría
 * creer a Google que todo contacto vale lo mismo que una consulta con nombre.
 */
const ACCION_CONTACTO = "7765289408"
const NOMBRE_CONTACTO = "Contacto directo"

const ACCIONES = {
  consulta: { id: ACCION_CONVERSION, nombre: NOMBRE_CONVERSION },
  contacto: { id: ACCION_CONTACTO, nombre: NOMBRE_CONTACTO },
} as const

export type ConversionASubir = {
  accion: keyof typeof ACCIONES
  /** El id del lead, o `contacto:<id del evento>` para un clic de contacto. */
  leadId: string
  gclid: string
  /** ISO. El cierre si lo hay; si no, el momento de la consulta. */
  cuando: string
  valor: number | null
  moneda: string | null
}

export type ResultadoSubida = {
  ok: boolean
  subidas: number
  rechazadas: { leadId: string; motivo: string }[]
  detalle?: string
  /**
   * Google cerró `UploadClickConversions` a integraciones nuevas: las cuentas
   * que no estaban usándolo reciben `CUSTOMER_NOT_ALLOWLISTED_FOR_THIS_FEATURE`
   * y hay que ir por la Data Manager API, que pide otro permiso de OAuth.
   *
   * Comprobado en esta cuenta el 13/9/2026: no está en la lista. Por eso queda
   * el CSV, que es la vía que la interfaz de Google sigue aceptando.
   */
  sinPermisoDeApi?: boolean
}

/**
 * Sube conversiones a Google contra el gclid de cada lead.
 *
 * ── POR QUE ESTA VIA Y NO LA ETIQUETA DE GTAG ──
 *
 * Es una decisión tomada y escrita, no una omisión. La política de privacidad
 * publicada del sitio dice, en negrita, que no usa cookies publicitarias ni de
 * seguimiento entre sitios; `gtag.js` instala `_gcl_aw` y `_gcl_dc`, que son
 * exactamente eso. Poner la etiqueta convertiría ese párrafo en falso.
 *
 * Y mide mejor. La etiqueta le enseña a Google a comprar formularios
 * completados; esto le enseña a comprar CONTRATOS. En un negocio donde el mejor
 * y el peor lead de un mes se diferencian en dos órdenes de magnitud, esa
 * distinción es lo que separa a Smart Bidding ayudando de Smart Bidding
 * empujando para el lado equivocado.
 *
 * Lo único que viaja es el gclid, el momento y —si se cargó— el monto. Ni
 * nombre, ni mail, ni empresa, ni el texto de la consulta.
 *
 * ── POR QUE `validar` EXISTE ──
 *
 * Una conversión aceptada por Google no se puede deshacer. `validar: true` hace
 * exactamente el mismo pedido con `validateOnly`, así que la pantalla puede
 * decir cuántas van a entrar y por qué se caen las otras ANTES de que sea
 * irreversible.
 */
export async function subirConversiones(
  filas: ConversionASubir[],
  { validar }: { validar: boolean }
): Promise<ResultadoSubida> {
  const c = credenciales()
  if (!c) return { ok: false, subidas: 0, rechazadas: [], detalle: "Faltan las variables GOOGLE_ADS_*" }
  if (filas.length === 0) return { ok: true, subidas: 0, rechazadas: [] }

  let token: string
  try {
    token = await accessToken(c)
  } catch (e) {
    return { ok: false, subidas: 0, rechazadas: [], detalle: e instanceof Error ? e.message : String(e) }
  }

  const conversions = filas.map((f) => ({
    gclid: f.gclid,
    conversionAction: `customers/${c.customerId}/conversionActions/${ACCIONES[f.accion].id}`,
    conversionDateTime: fechaParaGoogle(f.cuando),
    // Sin monto no se manda un cero: un cero le dice a Google que ese cliente
    // valió nada, que es peor que no decirle nada.
    ...(f.valor ? { conversionValue: f.valor, currencyCode: f.moneda ?? "ARS" } : {}),
  }))

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "developer-token": c.developerToken,
    "Content-Type": "application/json",
  }
  if (c.loginCustomerId) headers["login-customer-id"] = c.loginCustomerId

  const res = await fetch(`${API}/customers/${c.customerId}:uploadClickConversions`, {
    method: "POST",
    headers,
    // `partialFailure` es lo que permite que una fila mal formada no tire abajo
    // las otras diecinueve. Sin esto, un solo gclid vencido cancela el lote.
    body: JSON.stringify({ conversions, partialFailure: true, validateOnly: validar }),
    cache: "no-store",
  })

  if (!res.ok) {
    const detalle = await res.text().catch(() => "")
    return { ok: false, subidas: 0, rechazadas: [], detalle: `Google respondió ${res.status}. ${detalle.slice(0, 400)}` }
  }

  const cuerpo = (await res.json()) as {
    results?: ({ gclid?: string } | Record<string, never>)[]
    partialFailureError?: { message?: string; details?: unknown[] }
  }

  // En una respuesta con fallos parciales, las filas que fallaron vienen como
  // objetos vacíos EN LA MISMA POSICION que se mandaron. Es la única forma de
  // saber cuál se cayó.
  // El cierre de la API no viene como error HTTP sino como fallo parcial en
  // cada fila. Se detecta por el código, no por el texto: el mensaje de Google
  // cambia cuando se le ocurre.
  const codigos = JSON.stringify(cuerpo.partialFailureError?.details ?? [])
  if (codigos.includes("CUSTOMER_NOT_ALLOWLISTED_FOR_THIS_FEATURE")) {
    return {
      ok: false,
      subidas: 0,
      rechazadas: [],
      sinPermisoDeApi: true,
      detalle:
        "Google cerró la subida por API a integraciones nuevas y esta cuenta no está habilitada.",
    }
  }

  const rechazadas: { leadId: string; motivo: string }[] = []
  const resultados = cuerpo.results ?? []
  filas.forEach((f, i) => {
    const r = resultados[i] as { gclid?: string } | undefined
    if (!r || !r.gclid) {
      rechazadas.push({
        leadId: f.leadId,
        motivo: cuerpo.partialFailureError?.message ?? "Google no aceptó esta conversión",
      })
    }
  })

  return { ok: true, subidas: filas.length - rechazadas.length, rechazadas }
}

/** `2026-08-20 16:26:51-03:00`, uno de los formatos que Google acepta. */
function fechaParaGoogle(iso: string): string {
  const ZONA = "America/Argentina/Buenos_Aires"
  const d = new Date(iso)
  // El locale sueco ya devuelve "YYYY-MM-DD HH:mm:ss"; falta pegarle el offset.
  const base = new Intl.DateTimeFormat("sv-SE", {
    timeZone: ZONA,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).format(d)
  const off =
    new Intl.DateTimeFormat("en-US", { timeZone: ZONA, timeZoneName: "longOffset" })
      .format(d)
      .match(/GMT([+-]\d{2}:\d{2})/)?.[1] ?? "-03:00"
  return `${base}${off}`
}

/**
 * El archivo que acepta Google Ads → Objetivos → Subidas → Subir un archivo.
 *
 * Existe porque la vía por API está cerrada para esta cuenta (ver
 * `sinPermisoDeApi`). El formato lo sacó a fuerza de prueba y error
 * `accedra/scripts/ads/conversiones-offline.mjs`; acá se repite exacto.
 *
 * La primera línea es un PARAMETRO, no una fila: declara la zona horaria para
 * que Google no interprete las fechas en la suya.
 */
export function csvDeConversiones(filas: ConversionASubir[]): string {
  const escapar = (v: unknown) => {
    const s = String(v ?? "")
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }

  const lineas = [
    "Parameters:TimeZone=America/Argentina/Buenos_Aires",
    "Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency",
  ]

  for (const f of filas) {
    lineas.push(
      [
        escapar(f.gclid),
        escapar(ACCIONES[f.accion].nombre),
        escapar(fechaParaGoogle(f.cuando)),
        // Sin monto se manda vacío, no un cero: un cero le dice a Google que ese
        // cliente valió nada, que es peor que no decirle nada.
        escapar(f.valor ?? ""),
        escapar(f.valor ? (f.moneda ?? "ARS") : ""),
      ].join(",")
    )
  }

  return lineas.join("\n") + "\n"
}

/* ══════════════════════════════════════════════════════════════════════════
   Contacto directo
   ══════════════════════════════════════════════════════════════════════════ */

const NOMBRES_CONTACTO = ["whatsapp", "telefono", "email"]

type EventoContacto = {
  id: number
  created_at: string
  session_id: string | null
}

/**
 * Los clics a WhatsApp, teléfono o mail de gente que llegó por un anuncio.
 *
 * Es como contacta de verdad este público —en un año, 492 clics a llamar o
 * escribir contra 0 formularios— y hasta el 13/9/2026 Google no los contaba: la
 * cuenta no tenía ninguna conversión que los recibiera.
 *
 * Una fila por gclid, con el primer clic: la acción cuenta uno por clic de
 * anuncio, y mandar tres toques al mismo botón sólo generaría rechazos.
 *
 * No hay sello ni cola manual. Google Ads lee estas filas todos los días desde
 * `/api/marketing/conversiones/programada` (subida programada), y una fila con
 * el mismo gclid, nombre y hora que ya recibió la ignora — así que devolver los
 * últimos 90 días enteros cada vez es seguro y no duplica. A diferencia de las
 * consultas, un clic a WhatsApp no tiene nada que revisar antes de informarlo.
 *
 * Mismo criterio que con los leads: si no se puede verificar el tráfico interno,
 * no se sube nada.
 */
export async function colaDeContactos(): Promise<
  { ok: true; filas: ConversionASubir[]; descartadas: number } | { ok: false; error: string }
> {
  // Google no acepta clics de más de 90 días; se deja un día de margen.
  const desde = new Date(Date.now() - 89 * 86_400_000).toISOString()
  const { data, error } = await supabase
    .from("events")
    .select("id, created_at, session_id")
    .eq("type", "click")
    .in("name", NOMBRES_CONTACTO)
    .gte("created_at", desde)
    .order("created_at", { ascending: true })
    .limit(2000)
  if (error) {
    console.error("[contactos cola]", error)
    return { ok: false, error: "No se pudieron leer los clics de contacto" }
  }

  const eventos = (data ?? []) as EventoContacto[]
  const ids = [...new Set(eventos.map((e) => e.session_id).filter(Boolean))] as string[]
  if (ids.length === 0) return { ok: true, filas: [], descartadas: 0 }

  const { data: ses, error: errSes } = await supabase
    .from("sessions")
    .select("id, gclid, is_internal, is_bot")
    .in("id", ids)
  if (errSes) {
    console.error("[contactos sesiones]", errSes)
    return { ok: false, error: "No se pudo verificar el tráfico interno. No se subió nada." }
  }

  type Sesion = { id: string; gclid: string | null; is_internal: boolean | null; is_bot: boolean | null }
  const sesiones = new Map(((ses ?? []) as Sesion[]).map((s) => [String(s.id), s]))
  const sesionDe = (e: EventoContacto) => (e.session_id ? sesiones.get(e.session_id) : undefined)

  const vistos = new Set<string>()
  const filas: ConversionASubir[] = []
  let descartadas = 0
  for (const e of eventos) {
    const s = sesionDe(e)
    if (!s?.gclid || vistos.has(s.gclid)) continue
    vistos.add(s.gclid)
    if (s.is_internal || s.is_bot) {
      descartadas++
      continue
    }
    filas.push({
      accion: "contacto",
      leadId: `contacto:${e.id}`,
      gclid: s.gclid,
      cuando: e.created_at,
      valor: null,
      moneda: null,
    })
  }

  return { ok: true, filas, descartadas }
}
