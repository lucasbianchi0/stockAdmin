/**
 * La radiografía del período — un solo embudo con todos los canales y un
 * diagnóstico que dice dónde se corta.
 *
 * Sin imports de servidor: la arma el cliente con lo que ya trajeron las
 * pestañas (resultados del sitio, LinkedIn, Instagram, Facebook).
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
 * Porque de Google orgánico y del tráfico directo no sabemos cuántos nos vieron:
 * entran directo en "Visitas". Si se dividiera visitas totales por interacciones
 * de anuncios y redes, el paso podría dar 140% y no diría nada. Esos pasos se
 * calculan sólo con los canales que tienen las dos puntas.
 */

import { interacciones, type ResultadosLinkedin } from "@/lib/marketing/linkedin"
import type { ResultadosRed } from "@/lib/marketing/redes"
import { MOTIVO_SIN_ADS, pesos, porcentaje, type Resultados } from "@/lib/marketing/resultados"

/* ── Canales ──────────────────────────────────────────────────────────────── */

export const CANALES = ["ads", "linkedin", "meta", "organico", "otros"] as const
export type Canal = (typeof CANALES)[number]

export const CANAL_LABEL: Record<Canal, string> = {
  ads: "Google Ads",
  linkedin: "LinkedIn",
  meta: "Instagram y Facebook",
  organico: "Google orgánico",
  otros: "Directo y otros",
}

/**
 * Colores de identidad, en orden fijo: el canal conserva su color aunque en una
 * etapa no aparezca. Validados con el script de la skill de dataviz (CVD y
 * visión normal pasan; aqua y amarillo quedan bajo 3:1 sobre blanco, por eso
 * el embudo lleva leyenda y la tabla de canales repite cada cifra).
 */
export const CANAL_COLOR: Record<Canal, string> = {
  ads: "#2a78d6",
  linkedin: "#eb6834",
  meta: "#1baf7a",
  organico: "#eda100",
  otros: "oklch(0.760 0.018 256)", // --n-400: "el resto", sin identidad propia
}

/** El origen que devuelve la base ("Google Ads", "Meta", un utm_source…) llevado a un canal. */
export function canalDeOrigen(origen: string | null | undefined): Canal {
  const o = (origen ?? "").toLowerCase()
  if (o === "google ads") return "ads"
  if (o.includes("linkedin") || o === "li") return "linkedin"
  if (o === "meta" || o.includes("instagram") || o.includes("facebook") || o === "ig" || o === "fb") return "meta"
  if (o === "google orgánico" || o === "otros buscadores") return "organico"
  return "otros"
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
 * Los dos volúmenes (`llegadaDia`, `visitasDia`) son de Accedra, no del rubro:
 * se fijaron mirando el panel en octubre de 2026 y hay que moverlos cuando la
 * cuenta crezca.
 */
export const REFERENCIAS = {
  /** Vistas por día sumando anuncios y redes. */
  llegadaDia: { bien: 1000, mal: 300 },
  /** Visitas al sitio por día, de todos los orígenes. */
  visitasDia: { bien: 40, mal: 12 },
  /** CTR de los anuncios. Búsqueda B2B ronda 3–5%. */
  ctr: { bien: 0.03, mal: 0.015, minimo: 500 },
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
  /** Consultas que se ganan. Necesita tiempo: un lead de esta semana no se cierra esta semana. */
  cierre: { bien: 0.1, mal: 0.03, minimo: 6 },
  /** Consultas que siguen en "nuevo": nadie las trabajó. */
  sinGestionar: { bien: 0.2, mal: 0.5, minimo: 3 },
  /** Más que esto, la gente se va en la primera página. */
  rebote: 0.7,
} as const

/* ── Tipos ────────────────────────────────────────────────────────────────── */

/** `poco` = hay dato, pero no alcanza para concluir. */
export type Salud = "bien" | "flojo" | "mal" | "poco" | "sin-datos"

export type EtapaClave = "vistas" | "interes" | "visitas" | "contacto" | "cliente"

export type Hallazgo = {
  etapa: EtapaClave
  salud: "flojo" | "mal"
  titulo: string
  porque: string
  accion: string
  /** Para elegir entre dos problemas de la misma etapa: el que mueve más gente. */
  peso: number
}

export type Evaluacion = {
  canal: Canal | null
  salud: Salud
  /** Una línea: "Google Ads: CTR 2,1% (esperable 3%)". */
  texto: string
  hallazgo?: Hallazgo
}

export type Etapa = {
  clave: EtapaClave
  titulo: string
  pregunta: string
  total: number
  partes: Record<Canal, number>
  /** Del paso anterior a este, sólo con los canales que tienen las dos puntas. */
  paso: { tasa: number | null; texto: string } | null
  salud: Salud
  evaluaciones: Evaluacion[]
}

export type FilaCanal = {
  canal: Canal
  vistas: number | null
  interes: number | null
  visitas: number
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
}

export type Fuentes = {
  resultados: Resultados
  dias: number
  /** `null` = no cargó o no hay datos; la radiografía lo dice en `avisos`. */
  linkedin: ResultadosLinkedin | null
  instagram: ResultadosRed | null
  facebook: ResultadosRed | null
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

const n = (v: number) => Math.round(v).toLocaleString("es-AR")
const pct = (v: number, decimales = 1) => porcentaje(v, 1, decimales)

function vacio(): Record<Canal, number> {
  return { ads: 0, linkedin: 0, meta: 0, organico: 0, otros: 0 }
}

function suma(p: Record<Canal, number>, canales: readonly Canal[] = CANALES): number {
  return canales.reduce((s, c) => s + p[c], 0)
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
  t: { titulo: string; porque: string; accion: string }
): Hallazgo | undefined {
  if (salud !== "mal" && salud !== "flojo") return undefined
  return { etapa, salud, peso, ...t }
}

/* ── El armado ────────────────────────────────────────────────────────────── */

export function armarRadiografia(f: Fuentes): Radiografia {
  const r = f.resultados
  const t = r.sitio.totales
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

  const redes = [f.instagram, f.facebook].filter((x): x is ResultadosRed => !!x?.cuenta && !!x.ultimaBuena)
  if (!f.instagram?.cuenta) avisos.push("Instagram no está conectado: su llegada no está sumada.")
  if (!f.facebook?.cuenta) avisos.push("Facebook no está conectado: su llegada no está sumada.")
  const hayMeta = redes.length > 0

  /* ── Cifras por canal ── */

  const gasto = campanas.reduce((s, c) => s + c.coste, 0)
  const impresiones = campanas.reduce((s, c) => s + c.impresiones, 0)
  const clics = campanas.reduce((s, c) => s + c.clics, 0)

  const vistas = vacio()
  vistas.ads = impresiones
  vistas.linkedin = li?.totales.impresiones ?? 0
  vistas.meta = redes.reduce((s, x) => s + x.totales.vistas, 0)

  const interes = vacio()
  interes.ads = clics
  interes.linkedin = li ? interacciones(li.totales) + li.totales.clics : 0
  interes.meta = redes.reduce((s, x) => s + x.totales.interacciones, 0)

  const visitas = vacio()
  const leadsPorCanal = vacio()
  for (const o of r.sitio.origenes) {
    const c = canalDeOrigen(o.origen)
    visitas[c] += o.sesiones
    leadsPorCanal[c] += o.leads
  }

  // Contacto = dejaron el mail + tocaron WhatsApp/teléfono. Los clics a WhatsApp
  // sólo se saben por canal cuando vienen de un anuncio (gclid); el resto va a
  // "otros" para que la suma cierre con el total.
  const contacto = { ...leadsPorCanal }
  const contactosAdsDirectos = t.contactos_de_ads ?? 0
  contacto.ads += contactosAdsDirectos
  const totalContacto = t.leads_reales + t.contactos_directos
  contacto.otros += Math.max(0, totalContacto - suma(contacto))

  const cliente = vacio()
  for (const l of r.leads) if (!l.equipo && l.estado === "ganado") cliente[canalDeOrigen(l.origen)]++
  cliente.otros += Math.max(0, t.ganados - suma(cliente))

  const pagos: Canal[] = ["ads", "linkedin", "meta"]

  /* ── Etapa 1: nos vieron ── */

  const totalVistas = suma(vistas)
  const evVistas: Evaluacion[] = []
  if (hayAds || li || hayMeta) {
    const porDia = totalVistas / dias
    const s = juzgar(porDia, Infinity, REFERENCIAS.llegadaDia)
    evVistas.push({
      canal: null,
      salud: s,
      texto: `${n(porDia)} vistas por día (esperable ${n(REFERENCIAS.llegadaDia.bien)} o más)`,
      hallazgo: hallazgo("vistas", s, totalVistas, {
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
  if (hayAds && impresiones > 0) {
    const ctr = clics / impresiones
    const s = juzgar(ctr, impresiones, REFERENCIAS.ctr)
    evInteres.push({
      canal: "ads",
      salud: s,
      texto: `Google Ads: ${pct(ctr, 2)} hace clic (esperable ${pct(REFERENCIAS.ctr.bien, 0)})`,
      hallazgo: hallazgo("interes", s, impresiones, {
        titulo: "Los anuncios se muestran pero casi nadie hace clic",
        porque: `De ${n(impresiones)} veces que apareció un anuncio, ${n(clics)} terminaron en clic (${pct(ctr, 2)}). En búsqueda B2B lo normal es 3% o más: o el anuncio aparece en búsquedas que no son las nuestras, o el texto no dice por qué elegirnos.`,
        accion: "Revisar los términos de búsqueda y excluir los que no tienen que ver; reescribir los títulos con el beneficio concreto (firma con validez legal, en minutos).",
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
      hallazgo: hallazgo("interes", s, vistas.linkedin, {
        titulo: "Las publicaciones de LinkedIn no generan interés",
        porque: `${n(vistas.linkedin)} impresiones y ${n(interes.linkedin)} interacciones (${pct(tasa)}). Una página de empresa promedio anda en 2–4%: la gente ve las publicaciones y sigue de largo.`,
        accion: "Probar otros formatos (carrusel, caso real, dato con número) y temas más cercanos al dolor del cliente que a la empresa.",
      }),
    })
  }
  if (hayMeta && vistas.meta > 0) {
    const tasa = interes.meta / vistas.meta
    const s = juzgar(tasa, vistas.meta, REFERENCIAS.interaccionMeta)
    evInteres.push({
      canal: "meta",
      salud: s,
      texto: `Instagram y Facebook: ${pct(tasa)} interactúa (esperable ${pct(REFERENCIAS.interaccionMeta.bien)})`,
      hallazgo: hallazgo("interes", s, vistas.meta, {
        titulo: "Las publicaciones de Instagram y Facebook no generan interés",
        porque: `${n(vistas.meta)} vistas y ${n(interes.meta)} interacciones (${pct(tasa)}). La gente ve el contenido pero no reacciona.`,
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
      hallazgo: hallazgo("visitas", s, t.sesiones, {
        titulo: "Llega muy poca gente al sitio",
        porque: `${n(t.sesiones)} visitas en ${dias} días, unas ${n(porDia)} por día${
          visitas.organico ? `, ${n(visitas.organico)} desde Google orgánico` : ""
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
      hallazgo: hallazgo("visitas", s, clics, {
        titulo: "Se pierden clics entre el anuncio y el sitio",
        porque: `Los anuncios tuvieron ${n(clics)} clics pero se midieron ${n(visitas.ads)} visitas desde Ads (${pct(tasa, 0)}). Se paga cada clic: lo normal es que llegue 70% o más. O la página tarda en cargar y la gente se va, o se está perdiendo el gclid en el camino.`,
        accion: "Medir la velocidad de la landing en el celular y revisar que la URL final de los anuncios conserve el gclid (sin redirecciones intermedias).",
      }),
    })
  }
  for (const c of ["linkedin", "meta"] as const) {
    if (interes[c] <= 0) continue
    const tasa = visitas[c] / interes[c]
    const s = juzgar(tasa, interes[c], REFERENCIAS.redAVisita)
    const nombre = CANAL_LABEL[c]
    const viral = evInteres.find((e) => e.canal === c)?.salud === "bien"
    evVisitas.push({
      canal: c,
      salud: s,
      texto: `${nombre}: ${n(visitas[c])} visitas por ${n(interes[c])} interacciones`,
      hallazgo: hallazgo("visitas", s, interes[c], {
        titulo: viral
          ? `${nombre} tiene movimiento pero no lleva gente al sitio`
          : `${nombre} casi no trae visitas`,
        porque: `${n(interes[c])} interacciones y apenas ${n(visitas[c])} visitas al sitio desde ahí (${pct(tasa)}).${
          viral ? " El contenido engancha: el problema está en el paso siguiente, no en las publicaciones." : ""
        }`,
        accion: "Cerrar cada publicación con un llamado a la acción y el enlace (o el link en bio con utm), y que lleve a la página de la solución, no a la home.",
      }),
    })
  }

  /* ── Etapa 4: nos contactaron ── */

  const evContacto: Evaluacion[] = []
  const tasaRebote = t.sesiones ? t.rebotes / t.sesiones : 0
  if (t.sesiones > 0) {
    const tasa = totalContacto / t.sesiones
    const s = juzgar(tasa, t.sesiones, REFERENCIAS.conversion)
    const reboteAlto = tasaRebote > REFERENCIAS.rebote
    evContacto.push({
      canal: null,
      salud: s,
      texto: `${pct(tasa)} de las visitas consulta (esperable ${pct(REFERENCIAS.conversion.bien)})`,
      hallazgo: hallazgo("contacto", s, t.sesiones, {
        titulo: "La gente llega pero no consulta: el problema es la propuesta, no el tráfico",
        porque: `${n(t.sesiones)} visitas y ${n(totalContacto)} contactos (${pct(tasa)}); en B2B lo normal es 2–3%.${
          reboteAlto
            ? ` Además el ${pct(tasaRebote, 0)} se va en la primera página: lo que ve al llegar no coincide con lo que buscaba.`
            : ` La mayoría navega (${pct(1 - tasaRebote, 0)} mira más de una página) pero no encuentra un motivo para escribir.`
        }`,
        accion: reboteAlto
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
      hallazgo: hallazgo("contacto", s, visitas.ads, {
        titulo: "Las visitas de los anuncios no se convierten en consultas",
        porque: `Ads trajo ${n(visitas.ads)} visitas y ${n(contacto.ads)} contactos (${pct(tasa)}) con ${pesos(gasto)} invertidos. Se está pagando por gente que no termina consultando.`,
        accion: "Revisar que cada grupo de anuncios lleve a la página de esa solución y que la landing tenga un solo llamado a la acción.",
      }),
    })
  }

  /* ── Etapa 5: se volvieron clientes ── */

  const evCliente: Evaluacion[] = []
  const reales = r.leads.filter((l) => !l.equipo)
  const nuevos = reales.filter((l) => l.estado === "nuevo").length
  if (reales.length > 0) {
    const tasaSin = nuevos / reales.length
    // Al revés que el resto: más alto es peor.
    const s: Salud =
      reales.length < REFERENCIAS.sinGestionar.minimo
        ? "poco"
        : tasaSin >= REFERENCIAS.sinGestionar.mal
          ? "mal"
          : tasaSin > REFERENCIAS.sinGestionar.bien
            ? "flojo"
            : "bien"
    evCliente.push({
      canal: null,
      salud: s,
      texto: `${n(nuevos)} de ${n(reales.length)} consultas siguen sin tocar`,
      hallazgo: hallazgo("cliente", s, reales.length * 2, {
        titulo: "Las consultas entran pero nadie las trabaja",
        porque: `${n(nuevos)} de ${n(reales.length)} consultas siguen en "Nuevo" (${pct(tasaSin, 0)}). Una consulta B2B se enfría en horas: si no se contesta el mismo día, la mayoría ya no responde.`,
        accion: "Contestar cada consulta en menos de 24 horas y marcar el estado en Leads; sin eso tampoco se puede saber qué canal trae clientes.",
      }),
    })
  }
  if (t.leads_reales > 0) {
    const tasa = t.ganados / t.leads_reales
    const s = juzgar(tasa, t.leads_reales, REFERENCIAS.cierre)
    evCliente.push({
      canal: null,
      salud: s,
      texto: `${pct(tasa, 0)} de las consultas se ganó (esperable ${pct(REFERENCIAS.cierre.bien, 0)})`,
      hallazgo: hallazgo("cliente", s, t.leads_reales, {
        titulo: "Las consultas no se cierran",
        porque: `${n(t.leads_reales)} consultas y ${n(t.ganados)} ganadas (${pct(tasa, 0)}). Si las consultas se trabajan y aun así no cierran, o llegan empresas que no son para nosotros, o la propuesta comercial no convence.`,
        accion: "Revisar los perdidos: ¿por precio, por tamaño, por tiempo? Si es por tipo de cliente, ajustar a quién le hablan los anuncios; si es por propuesta, ajustar la oferta.",
      }),
    })
  }

  /* ── Etapas ── */

  const pasoDe = (num: Record<Canal, number>, den: Record<Canal, number>, todos: readonly Canal[], verbo: string) => {
    // Un canal sin dato arriba (una red sin conectar) inflaría la tasa con visitas que no salen de ningún lado.
    const canales = todos.filter((c) => den[c] > 0)
    const a = suma(num, canales)
    const b = suma(den, canales)
    return b > 0 ? { tasa: a / b, texto: `${pct(a / b, a / b < 0.1 ? 1 : 0)} ${verbo}` } : { tasa: null, texto: "sin base" }
  }

  const etapa = (
    clave: EtapaClave,
    titulo: string,
    pregunta: string,
    partes: Record<Canal, number>,
    paso: Etapa["paso"],
    evaluaciones: Evaluacion[],
    total = suma(partes)
  ): Etapa => ({ clave, titulo, pregunta, total, partes, paso, evaluaciones, salud: peor(evaluaciones) })

  const etapas: Etapa[] = [
    etapa("vistas", "Nos vieron", "Vistas de anuncios y publicaciones", vistas, null, evVistas),
    etapa("interes", "Les interesó", "Clics e interacciones", interes, pasoDe(interes, vistas, pagos, "interactuó"), evInteres),
    etapa("visitas", "Llegaron al sitio", "Visitas, sin bots ni equipo", visitas, pasoDe(visitas, interes, pagos, "llegó al sitio"), evVisitas, t.sesiones),
    etapa("contacto", "Nos contactaron", "Mail, WhatsApp o teléfono", contacto, pasoDe(contacto, visitas, CANALES, "consultó"), evContacto, totalContacto),
    etapa("cliente", "Se volvieron clientes", "Consultas marcadas como ganadas", cliente, t.leads_reales ? { tasa: t.ganados / t.leads_reales, texto: `${pct(t.ganados / t.leads_reales, 0)} de las consultas` } : null, evCliente, t.ganados),
  ]

  /* ── Diagnóstico ── */

  const hallazgos = etapas.flatMap((e, i) =>
    e.evaluaciones.flatMap((ev) => (ev.hallazgo ? [{ h: ev.hallazgo, orden: i }] : []))
  )
  // El cuello es el primer "mal" del recorrido: arreglar un paso de abajo no
  // sirve si arriba no entra nadie. Sin "mal", el primer "flojo".
  const ordenados = [...hallazgos].sort(
    (a, b) =>
      (a.h.salud === "mal" ? 0 : 1) - (b.h.salud === "mal" ? 0 : 1) || a.orden - b.orden || b.h.peso - a.h.peso
  )
  const cuello = ordenados[0]?.h ?? null
  const otros = ordenados.slice(1, 4).map((x) => x.h)

  const buenos = etapas.flatMap((e) => e.evaluaciones.filter((ev) => ev.salud === "bien").map((ev) => ev.texto))

  if (reales.length > 0 && t.ganados === 0 && nuevos < reales.length) {
    avisos.push("Ninguna consulta está marcada como ganada: si hubo cierres, cargarlos en Leads para que el último paso cuente.")
  }

  const canales: FilaCanal[] = CANALES.map((c) => ({
    canal: c,
    vistas: c === "organico" || c === "otros" ? null : vistas[c],
    interes: c === "organico" || c === "otros" ? null : interes[c],
    visitas: visitas[c],
    contactos: contacto[c],
    clientes: cliente[c],
  })).filter((f) => (f.vistas ?? 0) + (f.interes ?? 0) + f.visitas + f.contactos + f.clientes > 0)

  return { etapas, cuello, otros, buenos, avisos, canales, gasto, contactosAds: contacto.ads }
}
