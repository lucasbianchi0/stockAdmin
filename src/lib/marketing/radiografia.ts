/**
 * La radiografía del período — un solo embudo con todos los canales y un
 * diagnóstico que dice dónde se corta.
 *
 * Sin imports de servidor: la arma el cliente con lo que ya trajeron las
 * pestañas (sitio, LinkedIn, Instagram, Facebook) más el desglose por canal de
 * `/api/marketing/resultados/radiografia` (ver `radiografia-server.ts`).
 *
 * ── POR QUE EL DIAGNOSTICO SE HACE POR CANAL Y NO SOBRE EL TOTAL ──
 *
 * Porque cada canal mide la "interacción" distinto. Un CTR de anuncio de 3% es
 * bueno; una tasa de interacción de LinkedIn de 3% también, pero un like no es
 * un clic. Sumar todo y comparar contra una sola vara mezcla peras con manzanas
 * y el promedio no señala a nadie. Entonces la etapa muestra el total (para ver
 * el tamaño) y se evalúa canal por canal (para encontrar al culpable).
 *
 * ── POR QUE LAS TASAS DE LOS DOS PRIMEROS PASOS EXCLUYEN EL ORGANICO ──
 *
 * Porque de Google orgánico, de los chatbots y del tráfico directo no sabemos
 * cuántos nos vieron: entran directo en "Visitas". Si se dividiera visitas
 * totales por interacciones de anuncios y redes, el paso podría dar 140% y no
 * diría nada. Esos pasos se calculan sólo con los canales que tienen las dos
 * puntas.
 */

import { interacciones, type ResultadosLinkedin } from "@/lib/marketing/linkedin"
import type { ResultadosRed } from "@/lib/marketing/redes"
import { MOTIVO_SIN_ADS, pesos, porcentaje, type Campana, type Resultados } from "@/lib/marketing/resultados"

/* ── Canales ──────────────────────────────────────────────────────────────── */

export const CANALES = ["ads", "linkedin", "instagram", "facebook", "organico", "ia", "otros"] as const
export type Canal = (typeof CANALES)[number]

export const CANAL_LABEL: Record<Canal, string> = {
  ads: "Google Ads",
  linkedin: "LinkedIn",
  instagram: "Instagram",
  facebook: "Facebook",
  organico: "Buscadores (orgánico)",
  ia: "Chatbots de IA",
  otros: "Directo y otros",
}

/**
 * Colores de identidad, en orden fijo: el canal conserva su color aunque en una
 * etapa no aparezca. Validados con el script de la skill de dataviz en este
 * orden (CVD y visión normal pasan entre vecinos; aqua, amarillo y rosa quedan
 * bajo 3:1 sobre blanco, por eso el embudo lleva leyenda y la tabla de canales
 * repite cada cifra).
 */
export const CANAL_COLOR: Record<Canal, string> = {
  ads: "#2a78d6",
  linkedin: "#eb6834",
  instagram: "#1baf7a",
  facebook: "#eda100",
  organico: "#e87ba4",
  ia: "#008300",
  otros: "oklch(0.760 0.018 256)", // --n-400: "el resto", sin identidad propia
}

/** Los canales en los que sabemos cuánta gente nos vio antes de entrar. */
export const CANALES_CON_VISTAS: readonly Canal[] = ["ads", "linkedin", "instagram", "facebook"]

/* ── Clasificación del origen ─────────────────────────────────────────────── */

/**
 * Los chatbots que ya mandan gente al sitio, por host o por `utm_source`
 * (ChatGPT agrega `utm_source=chatgpt.com` solo). Medido en octubre de 2026:
 * 35 visitas de ChatGPT, 10 de Perplexity y 2 de Copilot en 90 días.
 */
const CHATBOTS: { patron: RegExp; nombre: string }[] = [
  { patron: /chatgpt|openai/, nombre: "ChatGPT" },
  { patron: /perplexity/, nombre: "Perplexity" },
  { patron: /copilot/, nombre: "Copilot" },
  { patron: /gemini\.google|bard\.google/, nombre: "Gemini" },
  { patron: /claude\.ai|anthropic/, nombre: "Claude" },
  { patron: /deepseek|meta\.ai|poe\.com|you\.com|mistral|grok|phind/, nombre: "Otros chatbots" },
]

export function chatbotDe(v: string | null | undefined): string | null {
  const s = (v ?? "").toLowerCase()
  if (!s) return null
  return CHATBOTS.find((c) => c.patron.test(s))?.nombre ?? null
}

function host(url: string | null | undefined): string {
  if (!url) return ""
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return url.toLowerCase()
  }
}

/**
 * El canal de una visita o de un lead, con lo que trae crudo.
 *
 * Es la misma lógica que `ses_origen` en `resultados_sitio`, con tres
 * diferencias a propósito: los chatbots salen de "Referidos", Instagram y
 * Facebook se separan, y Gmail (`com.google.android.gm`) deja de contar como
 * Google orgánico. Por eso las visitas de Avanzado → Sitio y Ads, que siguen
 * con la función SQL, pueden diferir en un puñado entre canales; el total no.
 */
export function canalDe(x: { gclid?: string | null; utm_source?: string | null; referrer?: string | null }): Canal {
  if (x.gclid) return "ads"
  const utm = (x.utm_source ?? "").toLowerCase()
  const ref = host(x.referrer)
  if (chatbotDe(utm) || chatbotDe(ref)) return "ia"
  if (utm) {
    if (utm.includes("linkedin") || utm === "li") return "linkedin"
    if (utm.includes("instagram") || utm === "ig") return "instagram"
    if (utm.includes("facebook") || utm === "fb") return "facebook"
    if (utm === "google" || utm === "bing") return "organico"
    return "otros"
  }
  if (ref.includes("linkedin")) return "linkedin"
  if (ref.includes("instagram")) return "instagram"
  if (ref.includes("facebook") || ref === "fb.me") return "facebook"
  if (/(^|\.)google\.[a-z.]+$/.test(ref) || /bing\.|duckduckgo|yahoo|baidu|ecosia|yandex/.test(ref)) return "organico"
  return "otros"
}

/** El origen ya resuelto por la base ("Google Ads", "Meta"…). Es el respaldo cuando el desglose del servidor no llegó. */
export function canalDeOrigen(origen: string | null | undefined): Canal {
  const o = (origen ?? "").toLowerCase()
  if (o === "google ads") return "ads"
  if (chatbotDe(o)) return "ia"
  if (o.includes("linkedin") || o === "li") return "linkedin"
  if (o.includes("instagram") || o === "ig") return "instagram"
  if (o === "meta" || o.includes("facebook") || o === "fb") return "facebook"
  if (o === "google orgánico" || o === "otros buscadores") return "organico"
  return "otros"
}

/* ── El desglose que arma el servidor ─────────────────────────────────────── */

export type CifrasCanal = {
  visitas: number
  /**
   * Clics a WhatsApp, teléfono o mail, por el canal de la visita. Se cuentan
   * clics y no visitas, como `contactos_directos` de la base, para que la suma
   * de los canales cierre con el total.
   */
  contactos: number
  leads: number
  ganados: number
}

export type PorCanal = Record<Canal, CifrasCanal>

export type FilaPais = { pais: string; visitas: number; contactos: number; leads: number }

export type FilaChatbot = {
  nombre: string
  visitas: number
  contactos: number
  leads: number
  /** Dónde entra la gente que manda: lo que el chatbot recomienda de nosotros. */
  paginas: { path: string; visitas: number }[]
}

export type FilaLanding = { path: string; visitas: number; contactos: number; leads: number }

export type ExtraRadiografia = {
  canales: PorCanal
  anterior: PorCanal
  /** Totales de Ads del período anterior; `null` si Google no contestó. */
  adsAnterior: { impresiones: number; clics: number; coste: number } | null
  geo: {
    paises: FilaPais[]
    /**
     * Visitas del exterior sin referente, sin anuncio, sin utm y sin un gesto
     * medido: casi seguro datacenters. No se descuentan de "Visitas" (eso lo
     * decide `resultados_sitio`), pero sí de la base de conversión.
     */
    dudosas: number
    exterior: number
  }
  chatbots: FilaChatbot[]
  landings: FilaLanding[]
  gestion: {
    /** Consultas reales en "nuevo" con más de 48 horas. */
    sinTocar: number
    /** La más vieja de esas, en días. */
    masVieja: number | null
    /** Consultas de hace 30 a 120 días: ya tuvieron tiempo de avanzar o cerrarse. */
    camada: { total: number; avanzaron: number; ganados: number; desde: string; hasta: string }
  }
}

/* ── Referencias ──────────────────────────────────────────────────────────── */

/**
 * Contra qué se compara cada paso.
 *
 * Son referencias del rubro para B2B (servicios a empresas, ticket alto), no
 * promesas: alcanzan para decir "esto está muy por debajo" con confianza.
 * `minimo` es la base por debajo de la cual no se concluye nada — con 12 clics,
 * un CTR malo es mala suerte.
 *
 * Los dos volúmenes (`llegadaDia`, `visitasDia`) son de Accedra, no del rubro.
 * Se fijaron con la base de octubre de 2026 (1.235 visitas contadas en 90 días,
 * ~14 por día) y hay que moverlos cuando la cuenta crezca.
 */
export const REFERENCIAS = {
  /** Vistas por día sumando anuncios y redes. */
  llegadaDia: { bien: 1000, mal: 300 },
  /** Visitas al sitio por día, de todos los orígenes. */
  visitasDia: { bien: 30, mal: 10 },
  /** CTR por tipo de campaña: una de Display nunca va a tener el de una de búsqueda. */
  ctr: {
    Búsqueda: { bien: 0.03, mal: 0.015, minimo: 500 },
    Display: { bien: 0.005, mal: 0.002, minimo: 3000 },
    "Performance Max": { bien: 0.01, mal: 0.004, minimo: 2000 },
    Video: { bien: 0.005, mal: 0.002, minimo: 3000 },
    otro: { bien: 0.02, mal: 0.008, minimo: 1000 },
  } as Record<string, { bien: number; mal: number; minimo: number }>,
  /** Interacciones + clics sobre impresiones en LinkedIn. La media de páginas de empresa ronda 2–4%. */
  interaccionLinkedin: { bien: 0.03, mal: 0.01, minimo: 300 },
  /** Interacciones sobre vistas en Instagram y Facebook. */
  interaccionMeta: { bien: 0.015, mal: 0.005, minimo: 300 },
  /** Clics de anuncio que terminan en una visita medida. Abajo de 50% se pierde gente en la carga o en la medición. */
  clicAVisita: { bien: 0.7, mal: 0.45, minimo: 20 },
  /** Visitas al sitio sobre interacciones en la red. */
  redAVisita: { bien: 0.1, mal: 0.03, minimo: 50 },
  /** Visitas que terminan en contacto (mail o WhatsApp). B2B ronda 2–3%. */
  conversion: { bien: 0.025, mal: 0.01, minimo: 60 },
  /** Una landing con estas visitas y ningún contacto ya es señal, no mala suerte. */
  landingMinima: 40,
  /** Consultas de la camada que se ganaron. */
  cierre: { bien: 0.1, mal: 0.03, minimo: 6 },
  /** Consultas de la camada que pasaron de "nuevo". */
  avance: { bien: 0.6, mal: 0.3, minimo: 4 },
  /** Más que esto, la gente se va en la primera página. */
  rebote: 0.7,
  /** Una caída de más de esto contra el período anterior se reporta como algo que se rompió. */
  caida: 0.3,
  /** Si más de esto de las visitas es tráfico dudoso del exterior, se avisa. */
  dudosas: 0.12,
} as const

/* ── Tipos ────────────────────────────────────────────────────────────────── */

/** `poco` = hay dato, pero no alcanza para concluir. */
export type Salud = "bien" | "flojo" | "mal" | "poco" | "sin-datos"

export type EtapaClave = "vistas" | "interes" | "visitas" | "contacto" | "cliente"

/** A qué pestaña de Avanzado lleva "ver detalle". */
export type Destino = "sitio" | "campanas" | "paginas" | "linkedin" | "instagram" | "facebook" | "leads"

export type Hallazgo = {
  etapa: EtapaClave
  salud: "flojo" | "mal"
  titulo: string
  porque: string
  accion: string
  destino: Destino
  /** Para elegir entre dos problemas de la misma etapa: el que mueve más gente. */
  peso: number
}

export type Evaluacion = {
  canal: Canal | null
  salud: Salud
  /** Una línea: "Google Ads (Búsqueda): 2,1% hace clic (esperable 3%)". */
  texto: string
  hallazgo?: Hallazgo
  /** Sólo se muestra con ese canal elegido en el filtro: en la vista general sería una línea por canal. */
  soloFiltro?: boolean
}

export type Etapa = {
  clave: EtapaClave
  titulo: string
  pregunta: string
  total: number
  /** El mismo paso en el período anterior; `null` si alguna fuente no lo tiene. */
  antes: number | null
  partes: Record<Canal, number>
  /** Del paso anterior a este, sólo con los canales que tienen las dos puntas. */
  paso: { tasa: number | null; texto: string } | null
  salud: Salud
  evaluaciones: Evaluacion[]
  destino: Destino
}

export type FilaCanal = {
  canal: Canal
  vistas: number | null
  interes: number | null
  visitas: number
  visitasAntes: number | null
  contactos: number
  clientes: number
}

export type Radiografia = {
  etapas: Etapa[]
  /** Dónde se corta el embudo. `null` = no hay nada grave o no hay datos. */
  cuello: Hallazgo | null
  /** Los otros problemas, de más a menos grave. */
  otros: Hallazgo[]
  /** Lo que anda bien, en una línea cada uno. */
  buenos: string[]
  /** Lo que falta medir: sin esto el diagnóstico puede estar mirando la mitad. */
  avisos: string[]
  canales: FilaCanal[]
  gasto: number
  contactosAds: number
  /** Si el desglose por canal vino del servidor o se estimó con los orígenes de la base. */
  desglose: "servidor" | "estimado"
  /** Las cuatro cifras de arriba, del canal elegido o de todo. */
  resumen: { contactos: number; contactosAntes: number | null; clientes: number; montoGanado: number | null }
  filtro: Canal | null
}

export type Fuentes = {
  resultados: Resultados
  dias: number
  extra: ExtraRadiografia | null
  /** `null` = no cargó o no hay datos; la radiografía lo dice en `avisos`. */
  linkedin: ResultadosLinkedin | null
  instagram: ResultadosRed | null
  facebook: ResultadosRed | null
  /** Un canal elegido en el filtro de logos: todo el resumen pasa a ser de ese canal. */
  filtro?: Canal | null
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

const n = (v: number) => Math.round(v).toLocaleString("es-AR")
const pct = (v: number, decimales = 1) => porcentaje(v, 1, decimales)

function vacio(): Record<Canal, number> {
  return { ads: 0, linkedin: 0, instagram: 0, facebook: 0, organico: 0, ia: 0, otros: 0 }
}

function suma(p: Record<Canal, number>, canales: readonly Canal[] = CANALES): number {
  return canales.reduce((s, c) => s + p[c], 0)
}

function campo(p: PorCanal, k: keyof CifrasCanal): Record<Canal, number> {
  const r = vacio()
  for (const c of CANALES) r[c] = p[c][k]
  return r
}

/** Tasa contra referencia, con la base mínima para animarse a concluir. */
function juzgar(tasa: number, base: number, ref: { bien: number; mal: number; minimo?: number }): Salud {
  if (ref.minimo !== undefined && base < ref.minimo) return "poco"
  if (tasa >= ref.bien) return "bien"
  if (tasa < ref.mal) return "mal"
  return "flojo"
}

const GRAVEDAD: Record<Salud, number> = { mal: 4, flojo: 3, bien: 2, poco: 1, "sin-datos": 0 }

function peor(evs: Evaluacion[]): Salud {
  if (!evs.length) return "sin-datos"
  return evs.reduce<Salud>((acc, e) => (GRAVEDAD[e.salud] > GRAVEDAD[acc] ? e.salud : acc), "sin-datos")
}

function hallazgo(
  etapa: EtapaClave,
  salud: Salud,
  peso: number,
  destino: Destino,
  t: { titulo: string; porque: string; accion: string }
): Hallazgo | undefined {
  if (salud !== "mal" && salud !== "flojo") return undefined
  return { etapa, salud, peso, destino, ...t }
}

const DESTINO_CANAL: Partial<Record<Canal, Destino>> = {
  ads: "campanas",
  linkedin: "linkedin",
  instagram: "instagram",
  facebook: "facebook",
}

/** El desglose por canal estimado con los orígenes de la base, para cuando el del servidor no llega. */
function estimarCanales(r: Resultados): PorCanal {
  const p = Object.fromEntries(CANALES.map((c) => [c, { visitas: 0, contactos: 0, leads: 0, ganados: 0 }])) as PorCanal
  for (const o of r.sitio.origenes) {
    const c = canalDeOrigen(o.origen)
    p[c].visitas += o.sesiones
    p[c].leads += o.leads
  }
  p.ads.contactos = r.sitio.totales.contactos_de_ads ?? 0
  p.otros.contactos = Math.max(0, r.sitio.totales.contactos_directos - p.ads.contactos)
  for (const l of r.leads) if (!l.equipo && l.estado === "ganado") p[canalDeOrigen(l.origen)].ganados++
  return p
}

/* ── El armado ────────────────────────────────────────────────────────────── */

export function armarRadiografia(f: Fuentes): Radiografia {
  const r = f.resultados
  const t = r.sitio.totales
  const prev = r.anterior
  const x = f.extra
  const dias = Math.max(1, f.dias)
  const avisos: string[] = []

  /* ── Disponibilidad de cada fuente ── */

  const campanas = r.ads.campanas
  const hayAds = campanas.length > 0
  if (!r.ads.ok) {
    avisos.push(
      `${MOTIVO_SIN_ADS[r.ads.motivo].titulo}${hayAds ? ": se usan las cifras del último cierre mensual" : ": los anuncios no entran en el embudo"}.`
    )
  }

  const li = f.linkedin && (f.linkedin.totales.impresiones > 0 || f.linkedin.cargas.contenido) ? f.linkedin : null
  if (!li) avisos.push("LinkedIn no tiene datos para el período: su llegada no está sumada.")
  else if (li.datosHasta.contenido && li.datosHasta.contenido < li.hasta) {
    avisos.push(`LinkedIn tiene datos hasta el ${li.datosHasta.contenido.split("-").reverse().join("/")}: faltan los últimos días.`)
  }

  const red = (d: ResultadosRed | null) => (d?.cuenta && d.ultimaBuena ? d : null)
  const ig = red(f.instagram)
  const fb = red(f.facebook)
  if (!ig) avisos.push("Instagram no está conectado: su llegada no está sumada (las visitas que manda sí).")
  if (!fb) avisos.push("Facebook no está conectado: su llegada no está sumada (las visitas que manda sí).")

  /* ── Cifras por canal ── */

  const pc = x?.canales ?? estimarCanales(r)
  // Un período anterior sin una sola visita es anterior a la medición, no un cero.
  const pa = x && suma(campo(x.anterior, "visitas")) > 0 ? x.anterior : null

  const gasto = campanas.reduce((s, c) => s + c.coste, 0)
  const impresiones = campanas.reduce((s, c) => s + c.impresiones, 0)
  const clics = campanas.reduce((s, c) => s + c.clics, 0)

  const vistas = vacio()
  vistas.ads = impresiones
  vistas.linkedin = li?.totales.impresiones ?? 0
  vistas.instagram = ig?.totales.vistas ?? 0
  vistas.facebook = fb?.totales.vistas ?? 0

  const interes = vacio()
  interes.ads = clics
  interes.linkedin = li ? interacciones(li.totales) + li.totales.clics : 0
  interes.instagram = ig ? ig.totales.interacciones : 0
  interes.facebook = fb ? fb.totales.interacciones : 0

  // Las visitas por canal se reparten con el desglose, pero el total es el de
  // `resultados_sitio`: es el número que se ve en todas las demás pestañas.
  const visitas = campo(pc, "visitas")
  visitas.otros += Math.max(0, t.sesiones - suma(visitas))

  const totalContacto = t.leads_reales + t.contactos_directos
  const contacto = vacio()
  for (const c of CANALES) contacto[c] = pc[c].leads + pc[c].contactos
  contacto.otros += Math.max(0, totalContacto - suma(contacto))

  const cliente = campo(pc, "ganados")
  cliente.otros += Math.max(0, t.ganados - suma(cliente))

  /* ── El período anterior, sólo si todas las fuentes lo tienen ── */

  const adsAntes = x?.adsAnterior ?? null
  const vistasAntes =
    x && (!hayAds || adsAntes)
      ? (adsAntes?.impresiones ?? 0) +
        (li?.anterior.impresiones ?? 0) +
        (ig?.anterior.vistas ?? 0) +
        (fb?.anterior.vistas ?? 0)
      : null
  const interesAntes =
    vistasAntes !== null
      ? (adsAntes?.clics ?? 0) +
        (li ? interacciones(li.anterior) + li.anterior.clics : 0) +
        (ig?.anterior.interacciones ?? 0) +
        (fb?.anterior.interacciones ?? 0)
      : null

  /* ── Etapa 1: nos vieron ── */

  const totalVistas = suma(vistas)
  const evVistas: Evaluacion[] = []
  if (hayAds || li || ig || fb) {
    const porDia = totalVistas / dias
    const s = juzgar(porDia, Infinity, REFERENCIAS.llegadaDia)
    evVistas.push({
      canal: null,
      salud: s,
      texto: `${n(porDia)} vistas por día (esperable ${n(REFERENCIAS.llegadaDia.bien)} o más)`,
      hallazgo: hallazgo("vistas", s, totalVistas, "campanas", {
        titulo: "Nos ve muy poca gente",
        porque: `Entre anuncios y redes hubo ${n(totalVistas)} vistas en ${dias} días: unas ${n(porDia)} por día. Con esta llegada, aunque el resto del embudo funcione, no alcanzan los números para tener consultas seguido.`,
        accion: hayAds
          ? "Subir el presupuesto de la campaña que mejor convierte y publicar en redes con más frecuencia. El problema no es la calidad, es la cantidad."
          : "Prender una campaña de búsqueda chica y publicar en redes con más frecuencia: hoy casi nadie llega a vernos.",
      }),
    })
  }

  /* ── Etapa 2: les interesó ── */

  const evInteres: Evaluacion[] = []

  // Ads se juzga por tipo de campaña: la vara de Display no es la de Búsqueda.
  const porTipo = new Map<string, Campana[]>()
  for (const c of campanas) {
    if (!c.impresiones) continue
    const tipo = REFERENCIAS.ctr[c.canal] ? c.canal : "otro"
    porTipo.set(tipo, [...(porTipo.get(tipo) ?? []), c])
  }
  for (const [tipo, cs] of porTipo) {
    const ref = REFERENCIAS.ctr[tipo]
    const imp = cs.reduce((s, c) => s + c.impresiones, 0)
    const cl = cs.reduce((s, c) => s + c.clics, 0)
    const ctr = cl / imp
    const s = juzgar(ctr, imp, ref)
    const nombreTipo = tipo === "otro" ? "otros tipos" : tipo
    // La culpable: la que más gasta entre las que están por debajo de la vara.
    const culpable = cs
      .filter((c) => c.impresiones >= ref.minimo / 2 && c.clics / c.impresiones < ref.bien)
      .sort((a, b) => b.coste - a.coste)[0]
    evInteres.push({
      canal: "ads",
      salud: s,
      texto: `Google Ads (${nombreTipo}): ${pct(ctr, 2)} hace clic (esperable ${pct(ref.bien, ref.bien < 0.01 ? 1 : 0)})`,
      hallazgo: hallazgo("interes", s, imp, "campanas", {
        titulo: culpable
          ? `La campaña «${culpable.nombre}» se muestra pero casi nadie hace clic`
          : "Los anuncios se muestran pero casi nadie hace clic",
        porque: `En ${nombreTipo}, de ${n(imp)} veces que apareció un anuncio, ${n(cl)} terminaron en clic (${pct(ctr, 2)}); lo normal para ese tipo es ${pct(ref.bien, 1)} o más.${
          culpable
            ? ` La que más pesa es «${culpable.nombre}»: ${pct(culpable.clics / culpable.impresiones, 2)} de clics con ${pesos(culpable.coste)} gastados.`
            : ""
        } O el anuncio aparece en búsquedas que no son las nuestras, o el texto no dice por qué elegirnos.`,
        accion:
          tipo === "Búsqueda"
            ? "Revisar los términos de búsqueda y excluir los que no tienen que ver; reescribir los títulos con el beneficio concreto (firma con validez legal, en minutos)."
            : "Revisar públicos y ubicaciones: excluir sitios y apps donde se muestra sin que nadie haga clic, y renovar las piezas.",
      }),
    })
  }

  if (li && vistas.linkedin > 0) {
    const tasa = interes.linkedin / vistas.linkedin
    const s = juzgar(tasa, vistas.linkedin, REFERENCIAS.interaccionLinkedin)
    evInteres.push({
      canal: "linkedin",
      salud: s,
      texto: `LinkedIn: ${pct(tasa)} interactúa (esperable ${pct(REFERENCIAS.interaccionLinkedin.bien, 0)})`,
      hallazgo: hallazgo("interes", s, vistas.linkedin, "linkedin", {
        titulo: "Las publicaciones de LinkedIn no generan interés",
        porque: `${n(vistas.linkedin)} impresiones y ${n(interes.linkedin)} interacciones (${pct(tasa)}). Una página de empresa promedio anda en 2–4%: la gente ve las publicaciones y sigue de largo.`,
        accion: "Probar otros formatos (carrusel, caso real, dato con número) y temas más cercanos al dolor del cliente que a la empresa.",
      }),
    })
  }
  for (const [c, d] of [["instagram", ig], ["facebook", fb]] as const) {
    if (!d || vistas[c] <= 0) continue
    const tasa = interes[c] / vistas[c]
    const s = juzgar(tasa, vistas[c], REFERENCIAS.interaccionMeta)
    evInteres.push({
      canal: c,
      salud: s,
      texto: `${CANAL_LABEL[c]}: ${pct(tasa)} interactúa (esperable ${pct(REFERENCIAS.interaccionMeta.bien)})`,
      hallazgo: hallazgo("interes", s, vistas[c], c, {
        titulo: `Las publicaciones de ${CANAL_LABEL[c]} no generan interés`,
        porque: `${n(vistas[c])} vistas y ${n(interes[c])} interacciones (${pct(tasa)}). La gente ve el contenido pero no reacciona.`,
        accion: "Más piezas con gancho en el primer segundo (reels, antes/después de firmar) y menos piezas institucionales.",
      }),
    })
  }

  /* ── Etapa 3: llegaron al sitio ── */

  const evVisitas: Evaluacion[] = []
  {
    const porDia = t.sesiones / dias
    const s = juzgar(porDia, Infinity, REFERENCIAS.visitasDia)
    evVisitas.push({
      canal: null,
      salud: s,
      texto: `${n(porDia)} visitas por día al sitio (esperable ${n(REFERENCIAS.visitasDia.bien)} o más)`,
      hallazgo: hallazgo("visitas", s, t.sesiones, "sitio", {
        titulo: "Llega muy poca gente al sitio",
        porque: `${n(t.sesiones)} visitas en ${dias} días, unas ${n(porDia)} por día${
          visitas.organico ? `, ${n(visitas.organico)} desde buscadores` : ""
        }. Con este caudal, aun convirtiendo bien, las consultas van a ser pocas y salteadas.`,
        accion: "Llevar más tráfico: más presupuesto en los anuncios que funcionan, enlace al sitio en cada publicación y notas del blog que respondan búsquedas reales.",
      }),
    })
  }
  if (hayAds && clics > 0) {
    const tasa = visitas.ads / clics
    const s = juzgar(tasa, clics, REFERENCIAS.clicAVisita)
    evVisitas.push({
      canal: "ads",
      salud: s,
      texto: `Google Ads: llega al sitio el ${pct(tasa, 0)} de los clics`,
      hallazgo: hallazgo("visitas", s, clics, "campanas", {
        titulo: "Se pierden clics entre el anuncio y el sitio",
        porque: `Los anuncios tuvieron ${n(clics)} clics pero se midieron ${n(visitas.ads)} visitas desde Ads (${pct(tasa, 0)}). Se paga cada clic: lo normal es que llegue 70% o más. O la página tarda en cargar y la gente se va, o se está perdiendo el gclid en el camino.`,
        accion: "Medir la velocidad de la landing en el celular y revisar que la URL final de los anuncios conserve el gclid (sin redirecciones intermedias).",
      }),
    })
  }
  for (const c of ["linkedin", "instagram", "facebook"] as const) {
    if (interes[c] <= 0) continue
    const tasa = visitas[c] / interes[c]
    const s = juzgar(tasa, interes[c], REFERENCIAS.redAVisita)
    const nombre = CANAL_LABEL[c]
    const viral = evInteres.find((e) => e.canal === c)?.salud === "bien"
    const enlaces = c === "instagram" ? (ig?.totales.clics_enlace ?? 0) : 0
    evVisitas.push({
      canal: c,
      salud: s,
      texto: `${nombre}: ${n(visitas[c])} visitas por ${n(interes[c])} interacciones`,
      hallazgo: hallazgo("visitas", s, interes[c], c, {
        titulo: viral ? `${nombre} tiene movimiento pero no lleva gente al sitio` : `${nombre} casi no trae visitas`,
        porque: `${n(interes[c])} interacciones y apenas ${n(visitas[c])} visitas al sitio desde ahí (${pct(tasa)})${
          enlaces ? `; ${n(enlaces)} tocaron el enlace del perfil` : ""
        }.${viral ? " El contenido engancha: el problema está en el paso siguiente, no en las publicaciones." : ""}`,
        accion: "Cerrar cada publicación con un llamado a la acción y el enlace con utm, y que lleve a la página de la solución, no a la home.",
      }),
    })
  }

  // Una caída fuerte contra el período anterior es otra clase de problema:
  // algo que andaba y se rompió. Se dice qué canal explica la mayor parte.
  if (prev && pa && prev.sesiones >= REFERENCIAS.conversion.minimo) {
    const caida = 1 - t.sesiones / prev.sesiones
    if (caida > REFERENCIAS.caida) {
      const culpable = CANALES.filter((c) => c !== "otros")
        .map((c) => ({ c, menos: pa[c].visitas - pc[c].visitas }))
        .sort((a, b) => b.menos - a.menos)[0]
      evVisitas.push({
        canal: culpable?.menos > 0 ? culpable.c : null,
        salud: "mal",
        texto: `${pct(caida, 0)} menos visitas que el período anterior`,
        hallazgo: hallazgo("visitas", "mal", t.sesiones * 2, culpable?.menos > 0 ? (DESTINO_CANAL[culpable.c] ?? "sitio") : "sitio", {
          titulo: `Las visitas cayeron ${pct(caida, 0)} contra el período anterior`,
          porque: `${n(t.sesiones)} visitas contra ${n(prev.sesiones)} antes.${
            culpable?.menos > 0
              ? ` La mayor parte se explica por ${CANAL_LABEL[culpable.c]}: ${n(pa[culpable.c].visitas)} → ${n(pc[culpable.c].visitas)}.`
              : ""
          } No es algo que siempre estuvo mal: algo cambió en este período.`,
          accion:
            culpable?.c === "ads"
              ? "Mirar Versiones de Ads y el historial de cambios: presupuesto, pausas, anuncios rechazados o pujas tocadas."
              : culpable?.c === "organico"
                ? "Revisar Search Console: una página que perdió posiciones o se desindexó."
                : "Ver qué dejó de hacerse en ese canal en este período (publicaciones, campañas, enlaces).",
        }),
      })
    }
  }

  /* ── Etapa 4: nos contactaron ── */

  const evContacto: Evaluacion[] = []
  const tasaRebote = t.sesiones ? t.rebotes / t.sesiones : 0
  // La base de conversión sin el tráfico dudoso del exterior: no son personas,
  // y dejarlas hunde la tasa y culpa a la propuesta de algo que no es.
  const dudosas = x?.geo.dudosas ?? 0
  const base = Math.max(0, t.sesiones - dudosas)
  if (base > 0) {
    const tasa = totalContacto / base
    const s = juzgar(tasa, base, REFERENCIAS.conversion)
    const reboteAlto = tasaRebote > REFERENCIAS.rebote
    const peorLanding = x?.landings
      .filter((l) => l.visitas >= REFERENCIAS.landingMinima && l.contactos + l.leads === 0)
      .sort((a, b) => b.visitas - a.visitas)[0]
    evContacto.push({
      canal: null,
      salud: s,
      texto: `${pct(tasa)} de las visitas consulta (esperable ${pct(REFERENCIAS.conversion.bien)})${dudosas ? `, sin ${n(dudosas)} dudosas` : ""}`,
      hallazgo: hallazgo("contacto", s, base, "paginas", {
        titulo: "La gente llega pero no consulta: el problema es la propuesta, no el tráfico",
        porque: `${n(base)} visitas${dudosas ? " reales" : ""} y ${n(totalContacto)} contactos (${pct(tasa)}); en B2B lo normal es 2–3%.${
          reboteAlto
            ? ` Además el ${pct(tasaRebote, 0)} se va en la primera página: lo que ve al llegar no coincide con lo que buscaba.`
            : ` La mayoría navega (${pct(1 - tasaRebote, 0)} mira más de una página) pero no encuentra un motivo para escribir.`
        }${
          peorLanding
            ? ` La landing que más pesa es ${peorLanding.path}: ${n(peorLanding.visitas)} visitas entraron por ahí y ninguna consultó.`
            : ""
        }`,
        accion: peorLanding
          ? `Empezar por ${peorLanding.path}: que la primera pantalla repita la promesa del anuncio, con un botón de WhatsApp visible sin hacer scroll.`
          : reboteAlto
            ? "Que la primera pantalla de cada landing repita la promesa del anuncio, con un botón de contacto visible sin hacer scroll."
            : "Reforzar la propuesta: precio o rango, casos reales, qué pasa después de consultar, y WhatsApp a un toque en todas las páginas.",
      }),
    })
  }
  if (hayAds && visitas.ads > 0) {
    const tasa = contacto.ads / visitas.ads
    const s = juzgar(tasa, visitas.ads, REFERENCIAS.conversion)
    evContacto.push({
      canal: "ads",
      salud: s,
      texto: `Google Ads: ${pct(tasa)} de sus visitas consulta${contacto.ads ? ` · ${pesos(gasto / contacto.ads)} por contacto` : ""}`,
      hallazgo: hallazgo("contacto", s, visitas.ads, "campanas", {
        titulo: "Las visitas de los anuncios no se convierten en consultas",
        porque: `Ads trajo ${n(visitas.ads)} visitas y ${n(contacto.ads)} contactos (${pct(tasa)}) con ${pesos(gasto)} invertidos. Se está pagando por gente que no termina consultando.`,
        accion: "Revisar que cada grupo de anuncios lleve a la página de esa solución y que la landing tenga un solo llamado a la acción.",
      }),
    })
  }

  for (const c of CANALES) {
    if (c === "ads" || visitas[c] <= 0) continue
    const tasa = contacto[c] / visitas[c]
    const s = juzgar(tasa, visitas[c], REFERENCIAS.conversion)
    evContacto.push({
      canal: c,
      soloFiltro: true,
      salud: s,
      texto: `${CANAL_LABEL[c]}: ${pct(tasa)} de sus visitas consulta (esperable ${pct(REFERENCIAS.conversion.bien)})`,
      hallazgo: hallazgo("contacto", s, visitas[c], "paginas", {
        titulo: `Las visitas de ${CANAL_LABEL[c]} no se convierten en consultas`,
        porque: `${CANAL_LABEL[c]} trajo ${n(visitas[c])} visitas y ${n(contacto[c])} contactos (${pct(tasa)}); en B2B lo normal es 2–3%. La gente que llega por acá no encuentra un motivo para escribir.`,
        accion:
          c === "ia"
            ? "Revisar las páginas que recomiendan los chatbots: que tengan precio o rango, casos y un botón de WhatsApp visible."
            : "Llevar ese tráfico a la página de la solución que se está mostrando, no a la home, y con un solo llamado a la acción.",
      }),
    })
  }

  /* ── Etapa 5: se volvieron clientes ── */

  const evCliente: Evaluacion[] = []
  const g = x?.gestion
  if (g && g.sinTocar > 0) {
    const s: Salud = g.sinTocar >= 3 || (g.masVieja ?? 0) > 7 ? "mal" : "flojo"
    evCliente.push({
      canal: null,
      salud: s,
      texto: `${n(g.sinTocar)} consultas sin tocar hace más de 48 horas`,
      hallazgo: hallazgo("cliente", s, Number.MAX_SAFE_INTEGER, "leads", {
        titulo: "Las consultas entran pero nadie las trabaja",
        porque: `${n(g.sinTocar)} ${g.sinTocar === 1 ? "consulta sigue" : "consultas siguen"} en "Nuevo" con más de 48 horas${
          g.masVieja ? `; la más vieja tiene ${n(g.masVieja)} días` : ""
        }. Una consulta B2B se enfría en horas: si no se contesta el mismo día, la mayoría ya no responde. Todo lo que se invierte arriba del embudo se pierde acá.`,
        accion: "Contestar cada consulta en menos de 24 horas y marcar el estado en Leads; sin eso tampoco se puede saber qué canal trae clientes.",
      }),
    })
  }
  if (g && g.camada.total > 0) {
    const c = g.camada
    const tasaAv = c.avanzaron / c.total
    const sAv = juzgar(tasaAv, c.total, REFERENCIAS.avance)
    evCliente.push({
      canal: null,
      salud: sAv,
      texto: `${pct(tasaAv, 0)} de las consultas de hace 1 a 4 meses avanzó`,
      hallazgo: hallazgo("cliente", sAv, c.total, "leads", {
        titulo: "Las consultas viejas quedaron sin seguimiento",
        porque: `De las ${n(c.total)} consultas que entraron entre el ${dia(c.desde)} y el ${dia(c.hasta)}, solo ${n(c.avanzaron)} pasaron de "Nuevo". Ya tuvieron tiempo de avanzar: si no se movieron, no se trabajaron o no se marcaron.`,
        accion: "Repasar esa camada en Leads: contactar las que siguen abiertas y marcar perdidas o descartadas las que no van, con el motivo.",
      }),
    })
    // Si la camada casi no se trabajó, juzgar el cierre culparía a la propuesta
    // de algo que es seguimiento.
    if (sAv === "bien") {
      const tasa = c.ganados / c.total
      const s = juzgar(tasa, c.total, REFERENCIAS.cierre)
      evCliente.push({
        canal: null,
        salud: s,
        texto: `${pct(tasa, 0)} de esa camada se ganó (esperable ${pct(REFERENCIAS.cierre.bien, 0)})`,
        hallazgo: hallazgo("cliente", s, c.total, "leads", {
          titulo: "Las consultas se trabajan pero no se cierran",
          porque: `${n(c.total)} consultas de hace 1 a 4 meses y ${n(c.ganados)} ganadas (${pct(tasa, 0)}). Si se trabajan y aun así no cierran, o llegan empresas que no son para nosotros, o la propuesta comercial no convence.`,
          accion: "Revisar los perdidos: ¿por precio, por tamaño, por tiempo? Si es por tipo de cliente, ajustar a quién le hablan los anuncios; si es por propuesta, ajustar la oferta.",
        }),
      })
    }
  }

  /* ── Etapas ── */

  const pasoDe = (num: Record<Canal, number>, den: Record<Canal, number>, todos: readonly Canal[], verbo: string) => {
    // Un canal sin dato arriba (una red sin conectar) inflaría la tasa con visitas que no salen de ningún lado.
    const canales = todos.filter((c) => den[c] > 0)
    const a = suma(num, canales)
    const b = suma(den, canales)
    return b > 0 ? { tasa: a / b, texto: `${pct(a / b, a / b < 0.1 ? 1 : 0)} ${verbo}` } : { tasa: null, texto: "sin base" }
  }

  const destinoDe = (evs: Evaluacion[], porDefecto: Destino) =>
    evs.find((e) => e.salud === peor(evs))?.hallazgo?.destino ?? porDefecto

  const etapa = (
    clave: EtapaClave,
    titulo: string,
    pregunta: string,
    partes: Record<Canal, number>,
    antes: number | null,
    paso: Etapa["paso"],
    evaluaciones: Evaluacion[],
    porDefecto: Destino,
    total = suma(partes)
  ): Etapa => ({
    clave,
    titulo,
    pregunta,
    total,
    antes,
    partes,
    paso,
    evaluaciones,
    salud: peor(evaluaciones),
    destino: destinoDe(evaluaciones, porDefecto),
  })

  const etapas: Etapa[] = [
    etapa("vistas", "Nos vieron", "Vistas de anuncios y publicaciones", vistas, vistasAntes, null, evVistas, "campanas"),
    etapa("interes", "Les interesó", "Clics e interacciones", interes, interesAntes, pasoDe(interes, vistas, CANALES_CON_VISTAS, "interactuó"), evInteres, "campanas"),
    etapa("visitas", "Llegaron al sitio", "Visitas, sin bots ni equipo", visitas, prev?.sesiones ?? null, pasoDe(visitas, interes, CANALES_CON_VISTAS, "llegó al sitio"), evVisitas, "sitio", t.sesiones),
    etapa("contacto", "Nos contactaron", "Mail, WhatsApp o teléfono", contacto, prev ? prev.leads_reales + prev.contactos_directos : null, pasoDe(contacto, visitas, CANALES, "consultó"), evContacto, "paginas", totalContacto),
    etapa("cliente", "Se volvieron clientes", "Consultas marcadas como ganadas", cliente, prev?.ganados ?? null, t.leads_reales ? { tasa: t.ganados / t.leads_reales, texto: `${pct(t.ganados / t.leads_reales, 0)} de las consultas` } : null, evCliente, "leads", t.ganados),
  ]

  /* ── El filtro por canal ── */

  // Con un canal elegido, cada etapa queda con la parte de ese canal, la tasa
  // entre pasos se recalcula sólo con él y quedan sus evaluaciones. Las
  // generales (volumen por día, gestión de consultas) no se le pueden cargar a
  // un canal y se van.
  const filtro = f.filtro ?? null
  const antesSocial = (d: ResultadosLinkedin | ResultadosRed | null, k: "vistas" | "interes") => {
    if (!d) return null
    if ("cargas" in d) return k === "vistas" ? d.anterior.impresiones : interacciones(d.anterior) + d.anterior.clics
    return k === "vistas" ? d.anterior.vistas : d.anterior.interacciones
  }
  const antesArriba = (k: "vistas" | "interes"): number | null => {
    if (filtro === "ads") return adsAntes ? (k === "vistas" ? adsAntes.impresiones : adsAntes.clics) : null
    if (filtro === "linkedin") return antesSocial(li, k)
    if (filtro === "instagram") return antesSocial(ig, k)
    if (filtro === "facebook") return antesSocial(fb, k)
    return null
  }
  const antesDe: Record<EtapaClave, number | null> = {
    vistas: antesArriba("vistas"),
    interes: antesArriba("interes"),
    visitas: pa && filtro ? pa[filtro].visitas : null,
    contacto: pa && filtro ? pa[filtro].leads + pa[filtro].contactos : null,
    cliente: pa && filtro ? pa[filtro].ganados : null,
  }
  const vista: Etapa[] = etapas.map((e, i) => {
    if (!filtro) {
      const evaluaciones = e.evaluaciones.filter((ev) => !ev.soloFiltro)
      return { ...e, evaluaciones, salud: peor(evaluaciones), destino: destinoDe(evaluaciones, e.destino) }
    }
    const partes = vacio()
    partes[filtro] = e.partes[filtro]
    const arriba = i > 0 ? etapas[i - 1].partes[filtro] : 0
    const evaluaciones = e.evaluaciones.filter((ev) => ev.canal === filtro)
    return {
      ...e,
      partes,
      total: e.partes[filtro],
      antes: antesDe[e.clave],
      paso: i > 0 && arriba > 0 ? { tasa: e.partes[filtro] / arriba, texto: `${pct(e.partes[filtro] / arriba, e.partes[filtro] / arriba < 0.1 ? 1 : 0)} siguió` } : null,
      evaluaciones,
      salud: peor(evaluaciones),
      destino: destinoDe(evaluaciones, DESTINO_CANAL[filtro] ?? e.destino),
    }
  })

  /* ── Diagnóstico ── */

  const hallazgos = vista.flatMap((e, i) =>
    e.evaluaciones.flatMap((ev) => (ev.hallazgo ? [{ h: ev.hallazgo, orden: i }] : []))
  )
  // El cuello es el primer "mal" del recorrido: arreglar un paso de abajo no
  // sirve si arriba no entra nadie. La única excepción son las consultas sin
  // tocar: es el arreglo más barato y el que más se pierde, así que va primero.
  const ordenados = [...hallazgos].sort(
    (a, b) =>
      (a.h.salud === "mal" ? 0 : 1) - (b.h.salud === "mal" ? 0 : 1) ||
      (a.h.peso === Number.MAX_SAFE_INTEGER ? -1 : 0) - (b.h.peso === Number.MAX_SAFE_INTEGER ? -1 : 0) ||
      a.orden - b.orden ||
      b.h.peso - a.h.peso
  )
  const cuello = ordenados[0]?.h ?? null
  const otros = ordenados.slice(1, 5).map((y) => y.h)

  const buenos = vista.flatMap((e) => e.evaluaciones.filter((ev) => ev.salud === "bien").map((ev) => ev.texto))

  if (x) {
    const fuera = x.geo.dudosas / Math.max(1, t.sesiones)
    if (fuera > REFERENCIAS.dudosas) {
      avisos.push(
        `${n(x.geo.dudosas)} visitas (${pct(fuera, 0)}) son del exterior, sin referente ni interacción medida: casi seguro bots. Se descontaron de la tasa de conversión.`
      )
    }
  } else {
    avisos.push("No llegó el desglose por canal: visitas y contactos se estimaron con los orígenes de la base (los WhatsApp que no son de Ads quedan en “Directo y otros”).")
  }

  // "—" y no 0 para una red sin conectar: no es que nadie nos vio, es que no lo sabemos.
  const conectado: Record<Canal, boolean> = {
    ads: hayAds,
    linkedin: !!li,
    instagram: !!ig,
    facebook: !!fb,
    organico: false,
    ia: false,
    otros: false,
  }
  const canales: FilaCanal[] = CANALES.map((c) => ({
    canal: c,
    vistas: conectado[c] ? vistas[c] : null,
    interes: conectado[c] ? interes[c] : null,
    visitas: visitas[c],
    visitasAntes: pa ? pa[c].visitas : null,
    contactos: contacto[c],
    clientes: cliente[c],
  })).filter((fila) => (fila.vistas ?? 0) + (fila.interes ?? 0) + fila.visitas + fila.contactos + fila.clientes > 0)

  const resumen = filtro
    ? {
        contactos: contacto[filtro],
        contactosAntes: antesDe.contacto,
        clientes: cliente[filtro],
        montoGanado: null,
      }
    : {
        contactos: totalContacto,
        contactosAntes: prev ? prev.leads_reales + prev.contactos_directos : null,
        clientes: t.ganados,
        montoGanado: t.monto_ganado,
      }

  return {
    etapas: vista,
    filtro,
    resumen,
    cuello,
    otros,
    buenos,
    avisos,
    canales,
    gasto,
    contactosAds: contacto.ads,
    desglose: x ? "servidor" : "estimado",
  }
}

/** "2026-07-01" → "01/07". */
function dia(iso: string): string {
  const [, m, d] = iso.split("-")
  return `${d}/${m}`
}
