import { supabase } from "@/lib/supabase"
import { traerCuenta, tokenInstagram, type Cuenta } from "@/lib/publicar/cuentas"
import type {
  DiaRed,
  PublicacionRed,
  Red,
  ResultadosRed,
  Sincronizacion,
  TotalesRed,
} from "@/lib/marketing/redes"

/*
 * Instagram y Facebook: traer de Meta, guardar, leer.
 *
 * QUÉ API Y POR QUÉ
 *
 * Facebook va por graph.facebook.com con un token de Página, que no vence si
 * sale de un token de usuario largo. Instagram acepta dos caminos y se elige
 * por el token guardado: uno de "Instagram Login" (empieza con IG) va por
 * graph.instagram.com, como el publicador; cualquier otro es el mismo token de
 * la Página de Facebook vinculada y va por graph.facebook.com. La app de Meta
 * de Accedra es de tipo Empresa y sólo ofrece el segundo, así que una sola
 * conexión trae las dos redes. Los nombres de métricas son los mismos.
 *
 * LAS MÉTRICAS QUE META SE LLEVÓ
 *
 * `impressions` ya no existe en ninguna de las dos (abril y noviembre de 2025);
 * el reemplazo es `views`/`page_media_view`. Y Meta da de baja métricas sin
 * mucho aviso, así que cada pedido de insights que falla se reintenta métrica
 * por métrica: una métrica muerta deja un null en su columna, no tira abajo
 * toda la sincronización del día.
 */

const VERSION_IG = process.env.INSTAGRAM_API_VERSION ?? "v23.0"
const BASE_IG_LOGIN = `https://graph.instagram.com/${VERSION_IG}`
const VERSION_FB = process.env.FACEBOOK_API_VERSION ?? "v23.0"
const BASE_FB = `https://graph.facebook.com/${VERSION_FB}`

/** Días que se vuelven a pedir en cada corrida: Meta corrige las cifras hasta 48 horas después. */
const DIAS_POR_CORRIDA = 4
/** La primera vez se trae un mes, que es lo que cubre el período por defecto del panel. */
const DIAS_PRIMERA_VEZ = 30

type FilaPublicacion = PublicacionRed & { red: Red; actualizado_en: string }

type FilaDia = { red: Red; fecha: string } & Partial<Record<keyof TotalesRed | "seguidores_total", number | null>>

/* ── HTTP ─────────────────────────────────────────────────────────────────── */

class ErrorMeta extends Error {}

async function pedir<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" })
  const cuerpo = (await res.json().catch(() => null)) as (T & { error?: { message?: string } }) | null
  if (!res.ok || !cuerpo || cuerpo.error) {
    throw new ErrorMeta(cuerpo?.error?.message ?? `HTTP ${res.status}`)
  }
  return cuerpo
}

function conParams(base: string, params: Record<string, string | number>): string {
  const u = new URL(base)
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v))
  return u.toString()
}

/**
 * Pide varias métricas juntas y, si el pedido entero falla, una por una. Devuelve
 * lo que haya podido leer, por nombre de métrica.
 */
async function insightsTolerantes<T extends { name: string }>(
  armarUrl: (metricas: string[]) => string,
  metricas: string[]
): Promise<Map<string, T>> {
  // Una métrica puede venir repetida con otro período (en los posts de
  // Facebook, el total `lifetime` primero y después uno `day`): vale la primera.
  const salida = new Map<string, T>()
  const leer = async (lista: string[]) => {
    for (const d of (await pedir<{ data: T[] }>(armarUrl(lista))).data) {
      if (!salida.has(d.name)) salida.set(d.name, d)
    }
  }

  try {
    await leer(metricas)
    return salida
  } catch {
    for (const m of metricas) {
      try {
        await leer([m])
      } catch {
        // Métrica no disponible para esta cuenta o dada de baja: queda en null.
      }
    }
    return salida
  }
}

/* ── Fechas ───────────────────────────────────────────────────────────────── */

function hoyAr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" })
}

function restarDias(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

/** Los últimos `n` días cerrados (sin hoy), del más viejo al más nuevo. */
function diasCerrados(n: number): string[] {
  const hoy = hoyAr()
  return Array.from({ length: n }, (_, i) => restarDias(hoy, n - i))
}

/** Medianoche de Argentina en segundos Unix. */
const inicioDelDia = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00-03:00`) / 1000)

/* ══════════════════════════════════════════════════════════════════════════
   Instagram
   ══════════════════════════════════════════════════════════════════════════ */

const METRICAS_IG_DIA = [
  "reach",
  "views",
  "total_interactions",
  "likes",
  "comments",
  "shares",
  "saves",
  "profile_links_taps",
] as const

type ValorTotal = { name: string; total_value?: { value?: number; breakdowns?: { results?: { dimension_values: string[]; value: number }[] }[] } }

async function sincronizarInstagram(cuenta: Cuenta, dias: string[]) {
  const token = await tokenInstagram(cuenta)
  const id = cuenta.cuentaId
  const BASE_IG = token.startsWith("IG") ? BASE_IG_LOGIN : BASE_FB

  // Por id y no por /me: con el token de la Página, /me es la Página.
  const perfil = await pedir<{ followers_count?: number }>(
    conParams(`${BASE_IG}/${id}`, { fields: "username,followers_count", access_token: token })
  )

  const filas: FilaDia[] = []
  for (const dia of dias) {
    const desde = inicioDelDia(dia)
    const rango = { period: "day", metric_type: "total_value", since: desde, until: desde + 86_400, access_token: token }
    const m = await insightsTolerantes<ValorTotal>(
      (lista) => conParams(`${BASE_IG}/${id}/insights`, { ...rango, metric: lista.join(",") }),
      [...METRICAS_IG_DIA]
    )
    const v = (nombre: string) => m.get(nombre)?.total_value?.value ?? null

    // Altas y bajas vienen en un desglose propio, y Meta no las da a cuentas con
    // menos de 100 seguidores: por eso van en un pedido aparte que puede fallar.
    let nuevos: number | null = null
    let perdidos: number | null = null
    try {
      const f = await pedir<{ data: ValorTotal[] }>(
        conParams(`${BASE_IG}/${id}/insights`, { ...rango, metric: "follows_and_unfollows", breakdown: "follow_type" })
      )
      for (const r of f.data[0]?.total_value?.breakdowns?.[0]?.results ?? []) {
        if (r.dimension_values[0] === "FOLLOWER") nuevos = r.value
        if (r.dimension_values[0] === "NON_FOLLOWER") perdidos = r.value
      }
    } catch {
      // Sin datos de altas y bajas para esta cuenta: quedan en null.
    }

    filas.push({
      red: "instagram",
      fecha: dia,
      alcance: v("reach"),
      vistas: v("views"),
      interacciones: v("total_interactions"),
      me_gusta: v("likes"),
      comentarios: v("comments"),
      compartidos: v("shares"),
      guardados: v("saves"),
      clics_enlace: v("profile_links_taps"),
      seguidores_nuevos: nuevos,
      seguidores_perdidos: perdidos,
    })
  }
  // El total de seguidores es una foto de ahora: va en el último día cerrado.
  if (filas.length && perfil.followers_count !== undefined) filas[filas.length - 1].seguidores_total = perfil.followers_count

  const medios = await pedir<{
    data: {
      id: string
      caption?: string
      media_type?: string
      media_product_type?: string
      permalink?: string
      timestamp?: string
      like_count?: number
      comments_count?: number
      thumbnail_url?: string
      media_url?: string
    }[]
  }>(
    conParams(`${BASE_IG}/${id}/media`, {
      fields: "id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count,thumbnail_url,media_url",
      limit: 50,
      access_token: token,
    })
  )

  const publicaciones: FilaPublicacion[] = []
  for (const p of medios.data) {
    const m = await insightsTolerantes<{ name: string; values?: { value: number }[] }>(
      (lista) => conParams(`${BASE_IG}/${p.id}/insights`, { metric: lista.join(","), access_token: token }),
      ["reach", "views", "saved", "shares", "total_interactions"]
    )
    const v = (nombre: string) => m.get(nombre)?.values?.[0]?.value ?? null
    publicaciones.push({
      red: "instagram",
      id: p.id,
      fecha: p.timestamp ?? null,
      tipo: p.media_product_type === "REELS" ? "Reel" : p.media_type === "CAROUSEL_ALBUM" ? "Carrusel" : p.media_type === "VIDEO" ? "Video" : "Imagen",
      texto: p.caption ?? null,
      url: p.permalink ?? null,
      miniatura: p.thumbnail_url ?? (p.media_type === "VIDEO" ? null : p.media_url ?? null),
      alcance: v("reach"),
      vistas: v("views"),
      me_gusta: p.like_count ?? null,
      comentarios: p.comments_count ?? null,
      compartidos: v("shares"),
      guardados: v("saved"),
      interacciones: v("total_interactions"),
      actualizado_en: new Date().toISOString(),
    })
  }

  return { filas, publicaciones }
}

/* ══════════════════════════════════════════════════════════════════════════
   Facebook
   ══════════════════════════════════════════════════════════════════════════ */

/** Métrica de Meta → columna. Las de `page_impressions*` y `page_fans*` ya no existen. */
const METRICAS_FB: Record<string, keyof TotalesRed> = {
  page_media_view: "vistas",
  page_total_media_view_unique: "alcance",
  page_post_engagements: "interacciones",
  page_views_total: "visitas_perfil",
  page_daily_follows_unique: "seguidores_nuevos",
}

type Serie = { name: string; values?: { value: number; end_time: string }[] }

async function sincronizarFacebook(cuenta: Cuenta, dias: string[]) {
  const token = cuenta.accessToken
  const id = cuenta.cuentaId

  // `end_time` marca el final del día en la hora del Pacífico: el valor es del día anterior.
  const desde = inicioDelDia(dias[0])
  const hasta = inicioDelDia(dias[dias.length - 1]) + 86_400 * 2
  const m = await insightsTolerantes<Serie>(
    (lista) =>
      conParams(`${BASE_FB}/${id}/insights`, {
        metric: lista.join(","),
        period: "day",
        since: desde,
        until: hasta,
        access_token: token,
      }),
    Object.keys(METRICAS_FB)
  )

  const porDia = new Map<string, FilaDia>(dias.map((d) => [d, { red: "facebook", fecha: d }]))
  for (const [metrica, columna] of Object.entries(METRICAS_FB)) {
    for (const punto of m.get(metrica)?.values ?? []) {
      const dia = new Date(Date.parse(punto.end_time) - 86_400_000).toISOString().slice(0, 10)
      const fila = porDia.get(dia)
      if (fila) fila[columna] = punto.value
    }
  }

  const pagina = await pedir<{ followers_count?: number }>(
    conParams(`${BASE_FB}/${id}`, { fields: "followers_count,name", access_token: token })
  )
  const filas = [...porDia.values()]
  if (filas.length && pagina.followers_count !== undefined) filas[filas.length - 1].seguidores_total = pagina.followers_count

  // Ni reacciones ni comentarios se pueden pedir como campos del post: Meta
  // exige `pages_read_user_content`, que un acceso a tareas sobre la Página no
  // da. Las reacciones salen igual de las estadísticas del post; los
  // comentarios quedan en null.
  const posts = await pedir<{
    data: {
      id: string
      message?: string
      created_time?: string
      permalink_url?: string
      full_picture?: string
      shares?: { count: number }
    }[]
  }>(
    conParams(`${BASE_FB}/${id}/posts`, {
      fields: "id,message,created_time,permalink_url,full_picture,shares",
      limit: 50,
      access_token: token,
    })
  )

  const publicaciones: FilaPublicacion[] = []
  for (const p of posts.data) {
    const pm = await insightsTolerantes<{ name: string; values?: { value: number | Record<string, number> }[] }>(
      (lista) => conParams(`${BASE_FB}/${p.id}/insights`, { metric: lista.join(","), access_token: token }),
      ["post_media_view", "post_total_media_view_unique", "post_reactions_by_type_total"]
    )
    const v = (nombre: string) => {
      const valor = pm.get(nombre)?.values?.[0]?.value
      return typeof valor === "number" ? valor : null
    }
    // Viene desglosado por tipo ({ like: 3, love: 1 }); se suman todas.
    const porTipo = pm.get("post_reactions_by_type_total")?.values?.[0]?.value
    const reacciones =
      porTipo && typeof porTipo === "object" ? Object.values(porTipo).reduce((a, n) => a + n, 0) : null
    const comentarios: number | null = null
    const compartidos = p.shares?.count ?? 0
    publicaciones.push({
      red: "facebook",
      id: p.id,
      fecha: p.created_time ?? null,
      tipo: "Publicación",
      texto: p.message ?? null,
      url: p.permalink_url ?? null,
      miniatura: p.full_picture ?? null,
      alcance: v("post_total_media_view_unique"),
      vistas: v("post_media_view"),
      me_gusta: reacciones,
      comentarios,
      compartidos,
      guardados: null,
      interacciones: (reacciones ?? 0) + (comentarios ?? 0) + compartidos,
      actualizado_en: new Date().toISOString(),
    })
  }

  return { filas, publicaciones }
}

/* ══════════════════════════════════════════════════════════════════════════
   Sincronizar
   ══════════════════════════════════════════════════════════════════════════ */

export async function sincronizarRed(red: Red, origen: "cron" | "manual") {
  const cuenta = await traerCuenta(red)
  if (!cuenta) return { red, ok: false, dias: 0, publicaciones: 0, detalle: "Cuenta sin conectar" }

  const { count } = await supabase.from("redes_dias").select("fecha", { count: "exact", head: true }).eq("red", red)
  const dias = diasCerrados(count ? DIAS_POR_CORRIDA : DIAS_PRIMERA_VEZ)

  let resultado: { red: Red; ok: boolean; dias: number; publicaciones: number; detalle: string | null }
  try {
    const { filas, publicaciones } =
      red === "instagram" ? await sincronizarInstagram(cuenta, dias) : await sincronizarFacebook(cuenta, dias)

    const ahora = new Date().toISOString()
    const { error: e1 } = await supabase
      .from("redes_dias")
      .upsert(filas.map((f) => ({ ...f, actualizado_en: ahora })), { onConflict: "red,fecha" })
    if (e1) throw e1
    if (publicaciones.length) {
      const { error: e2 } = await supabase.from("redes_publicaciones").upsert(publicaciones, { onConflict: "red,id" })
      if (e2) throw e2
    }
    resultado = { red, ok: true, dias: filas.length, publicaciones: publicaciones.length, detalle: null }
  } catch (e) {
    resultado = { red, ok: false, dias: 0, publicaciones: 0, detalle: e instanceof Error ? e.message : String(e) }
  }

  await supabase.from("redes_sincronizaciones").insert({ ...resultado, origen })
  return resultado
}

/* ══════════════════════════════════════════════════════════════════════════
   Leer
   ══════════════════════════════════════════════════════════════════════════ */

const COLUMNAS = [
  "alcance",
  "vistas",
  "interacciones",
  "me_gusta",
  "comentarios",
  "compartidos",
  "guardados",
  "clics_enlace",
  "visitas_perfil",
  "seguidores_nuevos",
  "seguidores_perdidos",
] as const

type FilaLeida = { fecha: string; seguidores_total: number | null } & Record<(typeof COLUMNAS)[number], number | null>

function sumar(filas: FilaLeida[]): TotalesRed {
  const t = Object.fromEntries(COLUMNAS.map((c) => [c, 0])) as TotalesRed
  for (const f of filas) for (const c of COLUMNAS) t[c] += f[c] ?? 0
  return t
}

async function diasEntre(red: Red, desde: string, hasta: string): Promise<FilaLeida[]> {
  const { data, error } = await supabase
    .from("redes_dias")
    .select(`fecha, seguidores_total, ${COLUMNAS.join(", ")}`)
    .eq("red", red)
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha")
  if (error) throw error
  return (data ?? []) as unknown as FilaLeida[]
}

const COLUMNAS_SYNC = "corrido_en, origen, ok, dias, publicaciones, detalle"

export async function redDelPeriodo(
  red: Red,
  rango: { desde: string; hasta: string },
  previo: { desde: string; hasta: string }
): Promise<ResultadosRed> {
  const [cuenta, dias, previos, pubs, ultima, ultimaBuena, seguidores] = await Promise.all([
    traerCuenta(red),
    diasEntre(red, rango.desde, rango.hasta),
    diasEntre(red, previo.desde, previo.hasta),
    supabase
      .from("redes_publicaciones")
      .select("id, fecha, tipo, texto, url, miniatura, alcance, vistas, me_gusta, comentarios, compartidos, guardados, interacciones")
      .eq("red", red)
      .gte("fecha", `${rango.desde}T00:00:00-03:00`)
      .lte("fecha", `${rango.hasta}T23:59:59-03:00`)
      .order("fecha", { ascending: false }),
    supabase.from("redes_sincronizaciones").select(COLUMNAS_SYNC).eq("red", red).order("corrido_en", { ascending: false }).limit(1).maybeSingle(),
    supabase
      .from("redes_sincronizaciones")
      .select(COLUMNAS_SYNC)
      .eq("red", red)
      .eq("ok", true)
      .order("corrido_en", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("redes_dias")
      .select("fecha, seguidores_total")
      .eq("red", red)
      .not("seguidores_total", "is", null)
      .order("fecha", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  for (const r of [pubs, ultima, ultimaBuena, seguidores]) if (r.error) throw r.error

  const serie: DiaRed[] = dias.map((d) => ({ dia: d.fecha, vistas: d.vistas ?? 0, seguidores: d.seguidores_nuevos ?? 0 }))

  return {
    red,
    cuenta: cuenta ? { nombre: cuenta.cuentaNombre, id: cuenta.cuentaId } : null,
    desde: rango.desde,
    hasta: rango.hasta,
    ultima: (ultima.data as Sincronizacion | null) ?? null,
    ultimaBuena: (ultimaBuena.data as Sincronizacion | null) ?? null,
    seguidores: (seguidores.data as { seguidores_total: number } | null)?.seguidores_total ?? null,
    datosHasta: dias.at(-1)?.fecha ?? null,
    totales: sumar(dias),
    anterior: sumar(previos),
    serie,
    publicaciones: (pubs.data ?? []) as PublicacionRed[],
  }
}
