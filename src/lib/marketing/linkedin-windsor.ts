import { supabase } from "@/lib/supabase"
import type { TipoCarga } from "@/lib/marketing/linkedin"

/*
 * LinkedIn por Windsor.ai: traer, guardar en las mismas tablas que el import.
 *
 * POR QUÉ WINDSOR
 *
 * LinkedIn no da la analítica de una página sin aprobar la Community
 * Management API (pedida el 21/10/2026, todavía en revisión). Windsor ya está
 * aprobado: Lucas autoriza la página de ACCEDRA S.A. en su panel y Windsor
 * expone los números por una URL con clave. El plan gratis permite una fuente,
 * que alcanza para la página.
 *
 * QUÉ PISA Y QUÉ NO
 *
 * Escribe en `linkedin_dias`, `linkedin_publicaciones` y `linkedin_demografia`,
 * las mismas tablas que llena el .xls, y deja una fila en `linkedin_cargas` por
 * tipo: la pantalla no se entera de dónde vinieron. Cada pedido escribe solo
 * sus columnas (el upsert de PostgREST deja las demás), así que las impresiones
 * patrocinadas, que Windsor no trae, quedan como las dejó el último .xls.
 *
 * Cada parte va por separado y una que falla no frena a las otras: Windsor
 * puede dar de baja un campo, y eso tiene que dejar un hueco, no un día entero
 * sin números.
 */

const BASE = "https://connectors.windsor.ai/linkedin_organic"
const ORIGEN = "Windsor.ai"

/** LinkedIn corrige las cifras de un día durante unos días: cada corrida vuelve a pedir la última semana. */
const DIAS_POR_CORRIDA = 7
/** La primera vez se trae el año, lo mismo que el export de «Últimos 365 días». */
const DIAS_PRIMERA_VEZ = 365
/** Por pedido. Los pedidos van en paralelo, así que el total queda cerca de esto. */
const TOPE_PEDIDO_MS = 45_000

export const windsorConfigurado = () => Boolean(process.env.WINDSOR_API_KEY)

type Fila = Record<string, unknown>

class ErrorWindsor extends Error {}

async function pedir(campos: string[], rango?: { desde: string; hasta: string }): Promise<Fila[]> {
  const u = new URL(BASE)
  u.searchParams.set("api_key", process.env.WINDSOR_API_KEY!)
  u.searchParams.set("fields", ["account_name", ...campos].join(","))
  if (rango) {
    u.searchParams.set("date_from", rango.desde)
    u.searchParams.set("date_to", rango.hasta)
  }
  // Si hay más de una página autorizada, solo la que se nombre.
  if (process.env.WINDSOR_LINKEDIN_CUENTA) u.searchParams.set("select_accounts", process.env.WINDSOR_LINKEDIN_CUENTA)

  // Windsor a veces tarda mucho la primera vez que pide algo a LinkedIn; un
  // pedido colgado no puede comerse el minuto de la función entera.
  const res = await fetch(u, { cache: "no-store", signal: AbortSignal.timeout(TOPE_PEDIDO_MS) }).catch((e) => {
    throw new ErrorWindsor(e instanceof Error && e.name === "TimeoutError" ? "Windsor no respondió a tiempo" : String(e))
  })
  const cuerpo = (await res.json().catch(() => null)) as { data?: Fila[]; error?: unknown } | null
  if (!res.ok || !cuerpo || cuerpo.error || !Array.isArray(cuerpo.data)) {
    const detalle = typeof cuerpo?.error === "string" ? cuerpo.error : `HTTP ${res.status}`
    throw new ErrorWindsor(detalle)
  }
  // Sin cuenta elegida a mano, solo lo de Accedra: una página personal o de
  // otra empresa autorizada por error no se mezcla con la nuestra.
  return process.env.WINDSOR_LINKEDIN_CUENTA
    ? cuerpo.data
    : cuerpo.data.filter((f) => !f.account_name || /accedra/i.test(String(f.account_name)))
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const entero = (v: unknown) => {
  const n = num(v)
  return n === null ? null : Math.round(n)
}
const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)
const dia = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null)

/* ── Por día ──────────────────────────────────────────────────────────────── */

/** Columna de `linkedin_dias` ← campo de Windsor, por tipo de carga. */
const DIARIOS: Record<TipoCarga, Record<string, string[]>> = {
  contenido: {
    impresiones: ["account_analytics_impression_count"],
    impresiones_unicas: ["account_analytics_unique_impressions_count"],
    clics: ["account_analytics_click_count"],
    reacciones: ["account_analytics_like_count"],
    comentarios: ["account_analytics_comment_count"],
    compartidos: ["account_analytics_share_count"],
  },
  // El export cuenta como "Total de seguidores" los nuevos del día, orgánicos más patrocinados.
  seguidores: {
    seguidores_nuevos: ["followers_gain_organic", "followers_gain_paid"],
    seguidores_pagos: ["followers_gain_paid"],
  },
  visitantes: {
    vistas_pagina: ["all_page_views"],
    visitantes_unicos: ["all_unique_page_views"],
  },
}

async function sincronizarDiario(tipo: TipoCarga, rango: { desde: string; hasta: string }) {
  const mapa = DIARIOS[tipo]
  const campos = [...new Set(Object.values(mapa).flat())]
  const filas = await pedir(["date", ...campos], rango)

  // Puede venir más de una fila por día (una por cuenta o por corte): se suman.
  const porDia = new Map<string, Record<string, number | null>>()
  for (const f of filas) {
    const fecha = dia(f.date)
    if (!fecha) continue
    const acc = porDia.get(fecha) ?? {}
    for (const [col, fuentes] of Object.entries(mapa)) {
      const valores = fuentes.map((c) => entero(f[c]))
      if (valores.every((v) => v === null)) continue
      acc[col] = (acc[col] ?? 0) + valores.reduce<number>((s, v) => s + (v ?? 0), 0)
    }
    porDia.set(fecha, acc)
  }

  const ahora = new Date().toISOString()
  const dias = [...porDia.entries()]
    .filter(([, v]) => Object.keys(v).length > 0)
    .map(([fecha, v]) => ({ fecha, ...v, actualizado_en: ahora }))
  if (dias.length === 0) return { tipo, filas: 0, desde: null, hasta: null }

  const { error } = await supabase.from("linkedin_dias").upsert(dias, { onConflict: "fecha" })
  if (error) throw error
  const fechas = dias.map((d) => d.fecha).sort()
  return { tipo, filas: dias.length, desde: fechas[0], hasta: fechas[fechas.length - 1] }
}

/* ── Publicaciones ────────────────────────────────────────────────────────── */

const CAMPOS_PUBLICACION = [
  "share_url",
  "share_title",
  "share_text",
  "share_created_time",
  "share_published_time",
  "share_media_category",
  "share_impression_count",
  "share_video_views",
  "share_clicks_count",
  "share_like_count",
  "share_comment_count",
  "share_count",
  "share_engagement_rate",
]

/**
 * El texto como se ve en LinkedIn. La API marca las menciones como
 * `@[Cisco](urn:li:organization:1063)` y los hashtags como
 * `{hashtag|\#|minería}`; el .xls los trae ya resueltos.
 */
const limpiarTexto = (t: string) =>
  t.replace(/@\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\{hashtag\|\\?#\|([^}]+)\}/g, "#$1")

/**
 * Para reconocer una publicación que ya entró por el .xls: el .xls guarda la
 * URL de la "activity" y la API la del "share" o "ugcPost", así que la misma
 * publicación llega con dos URLs. Se la reconoce por el comienzo del texto, sin
 * signos ni emojis. La fecha no sirve: el .xls usa la de publicación y una
 * programada se creó días antes.
 */
const huella = (titulo: string | null) => {
  const h = (titulo ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 40)
  return h.length >= 15 ? h : null
}

/** El "Tipo de contenido" del .xls. */
function tipoDeContenido(f: Fila): string | null {
  const categoria = String(f.share_media_category ?? "").toLowerCase()
  if ((entero(f.share_video_views) ?? 0) > 0) return "Vídeo"
  if (categoria === "poll") return "Encuesta"
  if (categoria === "article") return "Artículo"
  if (categoria === "document") return "Documento"
  return null
}

async function sincronizarPublicaciones(rango: { desde: string; hasta: string }) {
  const filas = await pedir(CAMPOS_PUBLICACION, rango)

  // Si ya está (por el .xls o por una corrida anterior), se actualiza esa fila.
  const { data: existentes, error: e1 } = await supabase.from("linkedin_publicaciones").select("url, titulo")
  if (e1) throw e1
  const porHuella = new Map<string, string>()
  for (const p of existentes ?? []) {
    const h = huella(p.titulo as string | null)
    if (h) porHuella.set(h, p.url as string)
  }

  const ahora = new Date().toISOString()
  const vistas = new Map<string, Fila>()
  for (const f of filas) {
    const urlWindsor = texto(f.share_url)
    if (!urlWindsor?.startsWith("http")) continue
    const crudo = texto(f.share_title) ?? texto(f.share_text)
    const titulo = crudo ? limpiarTexto(crudo).slice(0, 200) : null
    const fecha = dia(f.share_published_time) ?? dia(f.share_created_time)
    const h = huella(titulo)
    const url = (h && porHuella.get(h)) || urlWindsor
    const tasa = num(f.share_engagement_rate)
    vistas.set(url, {
      url,
      titulo,
      fecha,
      tipo: "Orgánico",
      contenido: tipoDeContenido(f),
      impresiones: entero(f.share_impression_count),
      vistas: entero(f.share_video_views),
      clics: entero(f.share_clicks_count),
      reacciones: entero(f.share_like_count),
      comentarios: entero(f.share_comment_count),
      compartidos: entero(f.share_count),
      // El .xls la da como fracción (0,05); si Windsor la da en puntos (5), se pasa a fracción.
      tasa_interaccion: tasa === null ? null : tasa > 1 ? tasa / 100 : tasa,
      actualizado_en: ahora,
    })
  }
  const lista = [...vistas.values()]
  if (lista.length === 0) return 0
  const { error } = await supabase.from("linkedin_publicaciones").upsert(lista, { onConflict: "url" })
  if (error) throw error
  return lista.length
}

/* ── Demografía ───────────────────────────────────────────────────────────── */

/** Dimensión (con el nombre que usa el .xls, que es el que ordena la pantalla) ← par de campos. */
const DEMOGRAFIA: Record<"seguidores" | "visitantes", [string, string, string][]> = {
  seguidores: [
    ["Sector", "industry_follower_type", "industry_follower_counts"],
    ["Función laboral", "function_follower_type", "function_follower_counts"],
    ["Nivel de responsabilidad", "seniority_follower_type", "seniority_follower_counts"],
    ["Tamaño de la empresa", "staff_follower_range", "staff_follower_counts"],
    ["Ubicación", "region_follower_name", "region_follower_counts"],
  ],
  visitantes: [
    ["Sector", "page_industry", "page_views_by_industry"],
    ["Función laboral", "page_function", "page_views_by_function"],
    ["Nivel de responsabilidad", "page_seniority", "page_views_by_seniority"],
    ["Tamaño de la empresa", "page_staff_count_range", "page_views_by_staff_count_range"],
    ["Ubicación", "page_region", "page_views_by_region"],
  ],
}

/**
 * Los valores en el castellano del .xls, para que una carga y la otra se lean
 * igual. Sector y ubicación quedan como los da la API (en inglés): son cientos y
 * LinkedIn no publica la traducción.
 */
const TRADUCCION: Record<string, Record<string, string>> = {
  "Nivel de responsabilidad": {
    Entry: "Sin experiencia",
    Senior: "Con experiencia",
    Manager: "Gerente",
    Director: "Director",
    CXO: "Directivo",
    Owner: "Propietario",
    VP: "Vicepresidente",
    Partner: "Socio",
    Training: "Formación",
    Unpaid: "Sin remuneración",
  },
  "Tamaño de la empresa": {
    SIZE_1: "1",
    SIZE_2_TO_10: "2-10",
    SIZE_11_TO_50: "11-50",
    SIZE_51_TO_200: "51-200",
    SIZE_201_TO_500: "201-500",
    SIZE_501_TO_1000: "501-1.000",
    SIZE_1001_TO_5000: "1.001-5.000",
    SIZE_5001_TO_10000: "5.001-10.000",
    SIZE_10001_OR_MORE: "10.001+",
  },
  "Función laboral": {
    Accounting: "Contabilidad",
    Administrative: "Administración",
    "Arts and Design": "Arte y diseño",
    "Business Development": "Desarrollo empresarial",
    "Community and Social Services": "Servicios sociales y comunitarios",
    Consulting: "Consultoría",
    "Customer Success and Support": "Soporte",
    Education: "Educación",
    Engineering: "Ingeniería",
    Entrepreneurship: "Liderazgo",
    Finance: "Finanzas",
    "Healthcare Services": "Servicios sanitarios",
    "Human Resources": "Recursos humanos",
    "Information Technology": "Tecnología de la información",
    Legal: "Legal",
    Marketing: "Marketing",
    "Media and Communication": "Medios de comunicación",
    "Military and Protective Services": "Servicios militares y de protección",
    Operations: "Operaciones",
    "Product Management": "Gestión de producto",
    "Program and Project Management": "Gestión de programas y proyectos",
    Purchasing: "Compras",
    "Quality Assurance": "Control de calidad",
    "Real Estate": "Bienes raíces",
    Research: "Investigación",
    Sales: "Ventas",
  },
}

/** Una foto, como en el import: si se pudo leer algo, reemplaza la anterior de esa fuente. */
async function sincronizarDemografia(fuente: "seguidores" | "visitantes", hoy: Date) {
  // Los seguidores son una foto a hoy; las visitas se cuentan en un período, y
  // se usa el año, igual que el export de «Últimos 365 días».
  const anio =
    fuente === "visitantes"
      ? { desde: isoDia(new Date(hoy.getTime() - DIAS_PRIMERA_VEZ * 86_400_000)), hasta: isoDia(hoy) }
      : undefined
  const filas: { fuente: string; dimension: string; valor: string; total: number }[] = []
  // Todas a la vez: de a una, las visitas del año pasan el minuto que da Vercel.
  // Una dimensión caída deja su hueco, no tira las demás.
  const respuestas = await Promise.all(
    DEMOGRAFIA[fuente].map(([, campoValor, campoTotal]) => pedir([campoValor, campoTotal], anio).catch(() => null))
  )
  for (const [i, [dimension, campoValor, campoTotal]] of DEMOGRAFIA[fuente].entries()) {
    const datos = respuestas[i]
    if (!datos) continue
    const suma = new Map<string, number>()
    for (const f of datos) {
      const crudo = texto(f[campoValor])
      const valor = crudo && (TRADUCCION[dimension]?.[crudo] ?? crudo)
      const total = entero(f[campoTotal])
      if (valor && total !== null && total > 0) suma.set(valor, (suma.get(valor) ?? 0) + total)
    }
    for (const [valor, total] of suma) filas.push({ fuente, dimension, valor, total })
  }
  if (filas.length === 0) return 0

  const { error: e1 } = await supabase.from("linkedin_demografia").delete().eq("fuente", fuente)
  if (e1) throw e1
  const { error: e2 } = await supabase.from("linkedin_demografia").insert(filas)
  if (e2) throw e2
  return filas.length
}

/* ── Todo junto ───────────────────────────────────────────────────────────── */

export type ParteSincronizada = {
  tipo: TipoCarga
  ok: boolean
  filas: number
  desde: string | null
  hasta: string | null
  detalle?: string
}

/** La fecha en Argentina: a las 22 hs del 28 ya es 29 en UTC. */
const isoDia = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" })

export async function sincronizarLinkedin(quien: string | null): Promise<ParteSincronizada[]> {
  if (!windsorConfigurado()) throw new ErrorWindsor("Falta WINDSOR_API_KEY")

  // ¿Ya entró algo por Windsor alguna vez? Si no, se trae el año.
  const { count, error } = await supabase
    .from("linkedin_cargas")
    .select("id", { count: "exact", head: true })
    .eq("archivo", ORIGEN)
  if (error) throw error
  // Hasta ayer: el día en curso viene a medias y se leería como un día flojo.
  const hoy = new Date()
  const ayer = new Date(hoy.getTime() - 86_400_000)
  const desde = new Date(hoy.getTime() - (count ? DIAS_POR_CORRIDA : DIAS_PRIMERA_VEZ) * 86_400_000)
  const rango = { desde: isoDia(desde), hasta: isoDia(ayer) }

  const partes = await Promise.all(
    (["contenido", "seguidores", "visitantes"] as const).map(async (tipo): Promise<ParteSincronizada> => {
      try {
        const r = await sincronizarDiario(tipo, rango)
        // Lo de cada tipo que no es por día: publicaciones con Contenido, demografía con los otros.
        // Si falla, el día igual quedó guardado.
        let detalle: string | undefined
        try {
          if (tipo === "contenido") await sincronizarPublicaciones(rango)
          else await sincronizarDemografia(tipo, hoy)
        } catch (e) {
          detalle = `${tipo === "contenido" ? "Publicaciones" : "Demografía"}: ${e instanceof Error ? e.message : e}`
        }
        return { ...r, ok: true, detalle }
      } catch (e) {
        return { tipo, ok: false, filas: 0, desde: null, hasta: null, detalle: e instanceof Error ? e.message : String(e) }
      }
    })
  )

  const cargas = partes
    .filter((p) => p.ok && p.filas > 0)
    .map((p) => ({ tipo: p.tipo, archivo: ORIGEN, cargado_por: quien, desde: p.desde, hasta: p.hasta, filas: p.filas }))
  if (cargas.length) {
    const { error: e2 } = await supabase.from("linkedin_cargas").insert(cargas)
    if (e2) throw e2
  }
  return partes
}
