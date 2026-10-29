/**
 * El desglose por canal que necesita la radiografía y `resultados_sitio` no da.
 *
 * Solo servidor. Lee sesiones, eventos y leads con el mismo filtro que la
 * función SQL (sin bots, sin equipo, sin visitas en las que nadie tocó nada) y
 * reparte cada cosa por el canal de la visita.
 *
 * ── POR QUE EN TYPESCRIPT Y NO EN OTRA FUNCION SQL ──
 *
 * Porque una función nueva hay que aplicarla a mano en el SQL Editor y hasta
 * entonces la pantalla no anda. Esto lee tablas que ya existen. El costo es
 * traer filas en vez de agregados: ~1.600 sesiones por trimestre, ~6.000 por
 * año, que pasan en un par de pedidos. Si el sitio crece un orden de magnitud,
 * esto tiene que pasar a SQL.
 */

import { supabase } from "@/lib/supabase"
import { campanasEnVivo } from "@/lib/marketing/ads-server"
import { leadsDelPeriodo } from "@/lib/marketing/resultados-server"
import {
  CANALES,
  canalDe,
  chatbotDe,
  type ExtraRadiografia,
  type FilaChatbot,
  type FilaLanding,
  type FilaPais,
  type PorCanal,
} from "@/lib/marketing/radiografia"
import type { Lead } from "@/lib/marketing/resultados"

type Sesion = {
  id: string
  gclid: string | null
  utm_source: string | null
  referrer: string | null
  landing_page: string | null
  country: string | null
  interactuo: boolean | null
}

type LeadCrudo = {
  id: string
  session_id: string | null
  gclid: string | null
  utm_source: string | null
  referrer: string | null
  landing_page: string | null
}

const CONTACTOS = ["whatsapp", "telefono", "email"]
const PAGINA = 1000

/** Trae todas las filas de una consulta, de a mil (el tope de PostgREST). */
async function todas<T>(consulta: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const filas: T[] = []
  for (let i = 0; ; i += PAGINA) {
    const { data, error } = await consulta(i, i + PAGINA - 1)
    if (error) throw new Error(error.message)
    filas.push(...(data ?? []))
    if (!data || data.length < PAGINA) return filas
  }
}

/** Mismos bordes que `resultados_sitio`: `p_desde::timestamptz` a `(p_hasta + 1)::timestamptz`, en la hora de la base (UTC). */
function bordes(desde: string, hasta: string) {
  const fin = new Date(`${hasta}T00:00:00Z`)
  fin.setUTCDate(fin.getUTCDate() + 1)
  return { d1: `${desde}T00:00:00Z`, d2: fin.toISOString() }
}

function camino(url: string | null): string | null {
  if (!url) return null
  try {
    return new URL(url, "https://accedra.com").pathname.replace(/\/$/, "") || "/"
  } catch {
    return null
  }
}

function vacio(): PorCanal {
  return Object.fromEntries(CANALES.map((c) => [c, { visitas: 0, contactos: 0, leads: 0, ganados: 0 }])) as PorCanal
}

/** Las visitas, los clics de contacto y los leads reales de un rango. */
async function crudo(desde: string, hasta: string) {
  const { d1, d2 } = bordes(desde, hasta)

  // Las visitas, los clics y los leads no dependen entre sí: van a la vez. Lo
  // único que espera es el detalle de los leads, que necesita sus ids.
  const margen = new Date(d2)
  margen.setUTCDate(margen.getUTCDate() + 1)
  const [sesiones, todosLosClics, leads] = await Promise.all([
    todas<Sesion>((a, b) =>
      supabase
        .from("sessions")
        .select("id, gclid, utm_source, referrer, landing_page, country, interactuo")
        .gte("created_at", d1)
        .lt("created_at", d2)
        .eq("is_bot", false)
        .eq("is_internal", false)
        .or("interactuo.is.null,interactuo.eq.true")
        .order("created_at")
        .range(a, b)
    ),
    // Los eventos de las visitas del rango. El evento puede caer un rato después
    // de medianoche del último día: se trae un día de margen y se filtra por visita.
    todas<{ session_id: string }>((a, b) =>
      supabase
        .from("events")
        .select("session_id")
        .eq("type", "click")
        .in("name", CONTACTOS)
        .gte("created_at", d1)
        .lt("created_at", margen.toISOString())
        .order("created_at")
        .range(a, b)
    ),
    // `equipo` y `estado` salen de la función de leads, que ya sabe quién es nuestro.
    leadsDelPeriodo(desde, hasta).then((l) => l.filter((x) => !x.equipo)),
  ])
  const porId = new Map(sesiones.map((s) => [s.id, s]))
  const clics = todosLosClics.filter((e) => porId.has(e.session_id))

  const crudos = leads.length
    ? await todas<LeadCrudo>((a, b) =>
        supabase
          .from("leads")
          .select("id, session_id, gclid, utm_source, referrer, landing_page")
          .in(
            "id",
            leads.map((l) => l.id)
          )
          .range(a, b)
      )
    : []
  const crudoDe = new Map(crudos.map((l) => [l.id, l]))

  return { sesiones, porId, clics, leads, crudoDe }
}

function repartir(c: Awaited<ReturnType<typeof crudo>>): PorCanal {
  const p = vacio()
  for (const s of c.sesiones) p[canalDe(s)].visitas++
  for (const e of c.clics) p[canalDe(c.porId.get(e.session_id)!)].contactos++
  for (const l of c.leads) {
    const canal = canalDe(c.crudoDe.get(l.id) ?? { gclid: l.gclid })
    p[canal].leads++
    if (l.estado === "ganado") p[canal].ganados++
  }
  return p
}

const PAISES = new Intl.DisplayNames(["es"], { type: "region" })

function nombrePais(codigo: string | null): string {
  if (!codigo) return "Sin dato"
  try {
    return PAISES.of(codigo) ?? codigo
  } catch {
    return codigo
  }
}

function restar(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - dias)
  return d.toISOString().slice(0, 10)
}

export async function radiografiaDelPeriodo(
  rango: { desde: string; hasta: string },
  previo: { desde: string; hasta: string }
): Promise<ExtraRadiografia> {
  const hoy = rango.hasta
  const camada = { desde: restar(hoy, 120), hasta: restar(hoy, 30) }

  // Todo en paralelo: son lecturas independientes y Google es la más lenta.
  const [actual, antes, adsPrevio, gestion] = await Promise.all([
    crudo(rango.desde, rango.hasta),
    crudo(previo.desde, previo.hasta),
    campanasEnVivo(previo.desde, previo.hasta),
    leadsDelPeriodo(camada.desde, hoy),
  ])

  /* ── Geo ── */

  const sesionDeLead = (l: Lead) => {
    const id = actual.crudoDe.get(l.id)?.session_id
    return id ? actual.porId.get(id) : undefined
  }
  const geoMapa = new Map<string, FilaPais>()
  const fila = (pais: string) => {
    let f = geoMapa.get(pais)
    if (!f) geoMapa.set(pais, (f = { pais, visitas: 0, contactos: 0, leads: 0 }))
    return f
  }
  for (const s of actual.sesiones) fila(nombrePais(s.country)).visitas++
  for (const e of actual.clics) fila(nombrePais(actual.porId.get(e.session_id)!.country)).contactos++
  for (const l of actual.leads) {
    const s = sesionDeLead(l)
    if (s) fila(nombrePais(s.country)).leads++
  }
  const ordenados = [...geoMapa.values()].sort((a, b) => b.visitas - a.visitas)
  const arriba = ordenados.filter((f) => f.pais !== "Sin dato").slice(0, 7)
  const resto = ordenados.filter((f) => !arriba.includes(f))
  const paises = [...arriba]
  if (resto.length) {
    paises.push(
      resto.reduce(
        (acc, f) => ({ ...acc, visitas: acc.visitas + f.visitas, contactos: acc.contactos + f.contactos, leads: acc.leads + f.leads }),
        { pais: resto.some((f) => f.pais !== "Sin dato") ? "Otros y sin dato" : "Sin dato", visitas: 0, contactos: 0, leads: 0 }
      )
    )
  }

  const exterior = actual.sesiones.filter((s) => s.country && s.country !== "AR")
  const dudosas = exterior.filter((s) => !s.referrer && !s.gclid && !s.utm_source && s.interactuo !== true).length

  /* ── Chatbots ── */

  const bots = new Map<string, FilaChatbot & { _paginas: Map<string, number> }>()
  const bot = (nombre: string) => {
    let b = bots.get(nombre)
    if (!b) bots.set(nombre, (b = { nombre, visitas: 0, contactos: 0, leads: 0, paginas: [], _paginas: new Map() }))
    return b
  }
  const botDe = (x: { utm_source: string | null; referrer: string | null }) => chatbotDe(x.utm_source) ?? chatbotDe(x.referrer)
  for (const s of actual.sesiones) {
    const nombre = botDe(s)
    if (!nombre) continue
    const b = bot(nombre)
    b.visitas++
    const p = camino(s.landing_page)
    if (p) b._paginas.set(p, (b._paginas.get(p) ?? 0) + 1)
  }
  for (const e of actual.clics) {
    const nombre = botDe(actual.porId.get(e.session_id)!)
    if (nombre) bot(nombre).contactos++
  }
  for (const l of actual.leads) {
    const c = actual.crudoDe.get(l.id)
    const nombre = c && botDe(c)
    if (nombre) bot(nombre).leads++
  }
  const chatbots: FilaChatbot[] = [...bots.values()]
    .map(({ _paginas, ...b }) => ({
      ...b,
      paginas: [..._paginas.entries()]
        .sort((a, z) => z[1] - a[1])
        .slice(0, 3)
        .map(([path, visitas]) => ({ path, visitas })),
    }))
    .sort((a, b) => b.visitas - a.visitas)

  /* ── Landings ── */

  const land = new Map<string, FilaLanding>()
  const landing = (path: string) => {
    let f = land.get(path)
    if (!f) land.set(path, (f = { path, visitas: 0, contactos: 0, leads: 0 }))
    return f
  }
  for (const s of actual.sesiones) {
    const p = camino(s.landing_page)
    if (p) landing(p).visitas++
  }
  for (const e of actual.clics) {
    const p = camino(actual.porId.get(e.session_id)!.landing_page)
    if (p) landing(p).contactos++
  }
  for (const l of actual.leads) {
    const p = camino(sesionDeLead(l)?.landing_page ?? actual.crudoDe.get(l.id)?.landing_page ?? null)
    if (p) landing(p).leads++
  }
  const landings = [...land.values()].sort((a, b) => b.visitas - a.visitas).slice(0, 15)

  /* ── Gestión ── */

  const reales = gestion.filter((l) => !l.equipo)
  const limite = Date.now() - 48 * 3_600_000
  const sinTocar = reales.filter((l) => l.estado === "nuevo" && new Date(l.created_at).getTime() < limite)
  const masVieja = sinTocar.length
    ? Math.floor((Date.now() - Math.min(...sinTocar.map((l) => new Date(l.created_at).getTime()))) / 86_400_000)
    : null
  const deCamada = reales.filter((l) => l.created_at.slice(0, 10) <= camada.hasta)

  /* ── Ads del período anterior ── */

  const adsAnterior =
    adsPrevio.ok || adsPrevio.campanas.length
      ? adsPrevio.campanas.reduce(
          (acc, c) => ({ impresiones: acc.impresiones + c.impresiones, clics: acc.clics + c.clics, coste: acc.coste + c.coste }),
          { impresiones: 0, clics: 0, coste: 0 }
        )
      : null

  return {
    canales: repartir(actual),
    anterior: repartir(antes),
    adsAnterior,
    geo: { paises, dudosas, exterior: exterior.length },
    chatbots,
    landings,
    gestion: {
      sinTocar: sinTocar.length,
      masVieja,
      camada: {
        total: deCamada.length,
        avanzaron: deCamada.filter((l) => l.estado !== "nuevo").length,
        ganados: deCamada.filter((l) => l.estado === "ganado").length,
        ...camada,
      },
    },
  }
}
