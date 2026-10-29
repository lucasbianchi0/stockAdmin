/**
 * Calendario del equipo — tipos, repeticiones y estado de las corridas.
 *
 * Sin imports de servidor: lo comparten la grilla, el diálogo y la API, y así
 * las dos puntas validan y despliegan las repeticiones con las mismas funciones.
 *
 * Las fechas viajan como `YYYY-MM-DD` y las horas como `HH:MM`, en horario de
 * Argentina, y se calculan sin `new Date(iso)` por lo mismo que explica
 * `lib/admin/fecha.ts`: un ISO pelado se parsea como UTC y corre el día.
 */

import { hoyArgentina, sumarDias } from "@/lib/admin/fecha"

/* ── Tipos ────────────────────────────────────────────────────────────────── */

export const TIPOS = ["persona", "agente", "proceso"] as const
export type Tipo = (typeof TIPOS)[number]

export const TIPO_LABEL: Record<Tipo, string> = {
  persona: "Personas",
  agente: "Agentes",
  proceso: "Procesos",
}

/** Lo que distingue a uno de otro, dicho una vez en el formulario. */
export const TIPO_PISTA: Record<Tipo, string> = {
  persona: "Lo hace alguien del equipo",
  agente: "Un modelo que analiza y propone — alguien revisa lo que deja",
  proceso: "Un script que trae o mueve datos, sin decidir nada",
}

/** Personas en azul de marca; agentes en violeta, el mismo de la etiqueta de
 *  agente de la ticketera; procesos en verde azulado. */
export const TIPO_COLOR: Record<Tipo, { punto: string; chip: string; borde: string }> = {
  persona: {
    punto: "bg-brand-500",
    chip: "bg-brand-50 text-brand-800 hover:bg-brand-100",
    borde: "border-l-brand-500",
  },
  agente: {
    punto: "bg-violet-500",
    chip: "bg-violet-50 text-violet-800 hover:bg-violet-100",
    borde: "border-l-violet-500",
  },
  proceso: {
    punto: "bg-teal-500",
    chip: "bg-teal-50 text-teal-800 hover:bg-teal-100",
    borde: "border-l-teal-500",
  },
}

export const REPETICIONES = ["nunca", "diaria", "semanal", "mensual", "continua"] as const
export type Repeticion = (typeof REPETICIONES)[number]

export const REPETICION_LABEL: Record<Repeticion, string> = {
  nunca: "Una vez",
  diaria: "Todos los días",
  semanal: "Semanal",
  mensual: "Mensual",
  continua: "Cada pocos minutos",
}

export const EJECUTORES = ["github", "claude", "vercel", "local", "otro"] as const
export type Ejecutor = (typeof EJECUTORES)[number]

export const EJECUTOR_LABEL: Record<Ejecutor, string> = {
  github: "GitHub Actions",
  claude: "Rutina de Claude",
  vercel: "Cron de Vercel",
  local: "A mano, en una compu",
  otro: "Otro",
}

export const ESTADOS = ["activo", "planificado", "pausado"] as const
export type Estado = (typeof ESTADOS)[number]

export const ESTADO_LABEL: Record<Estado, string> = {
  activo: "Activo",
  planificado: "Planificado",
  pausado: "Pausado",
}

export const ESTADO_PISTA: Record<Estado, string> = {
  activo: "Corre, y si un día no avisa, el calendario lo marca",
  planificado: "Todavía no existe: reserva su lugar en la semana",
  pausado: "Existe pero no corre",
}

/** 0 = domingo, como `Date.getDay()` y como la columna `dias_semana`. */
export const DIAS_CORTOS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]
export const DIAS_LARGOS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"]
/** La grilla arranca el lunes: la semana de trabajo se lee de corrido. */
export const ORDEN_SEMANA = [1, 2, 3, 4, 5, 6, 0]

export const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
]

export const LIMITES = { titulo: 120, descripcion: 4000 } as const

/* ── Datos ────────────────────────────────────────────────────────────────── */

export type Usuario = { id: string; nombre: string }
export type Yo = { id: string | null; nombre: string }

export type Entrada = {
  id: string
  tipo: Tipo
  titulo: string
  descripcion: string | null
  fecha: string
  /** `HH:MM`, o `null` = todo el día. */
  hora: string | null
  duracionMin: number
  repeticion: Repeticion
  diasSemana: number[]
  intervaloMin: number | null
  hasta: string | null
  personas: Usuario[]
  ejecutor: Ejecutor | null
  clave: string | null
  estado: Estado
  autorNombre: string
  /** Día de Argentina en que se cargó. Hasta ese día inclusive no había a
   *  quién avisarle —la corrida de la mañana pudo ser antes de cargarla—, así
   *  que no puede faltar ninguna. */
  creadaEl: string
}

export type Corrida = {
  id: string
  clave: string
  inicio: string
  fin: string | null
  ok: boolean
  detalle: string | null
  origen: "cron" | "manual" | "agente"
}

/** Lo que el formulario edita. */
export type Borrador = {
  tipo: Tipo
  titulo: string
  descripcion: string
  fecha: string
  hora: string
  duracionMin: number
  repeticion: Repeticion
  diasSemana: number[]
  intervaloMin: number | null
  hasta: string
  personas: string[]
  ejecutor: Ejecutor | null
  clave: string
  estado: Estado
}

export function borradorVacio(fecha: string, tipo: Tipo = "persona", yoId: string | null = null): Borrador {
  return {
    tipo,
    titulo: "",
    descripcion: "",
    fecha,
    hora: "09:00",
    duracionMin: 60,
    repeticion: "nunca",
    diasSemana: [],
    intervaloMin: null,
    hasta: "",
    personas: yoId ? [yoId] : [],
    ejecutor: tipo === "persona" ? null : "claude",
    clave: "",
    estado: tipo === "persona" ? "activo" : "planificado",
  }
}

export function esTipo(v: unknown): v is Tipo {
  return typeof v === "string" && (TIPOS as readonly string[]).includes(v)
}
export function esRepeticion(v: unknown): v is Repeticion {
  return typeof v === "string" && (REPETICIONES as readonly string[]).includes(v)
}
export function esEjecutor(v: unknown): v is Ejecutor {
  return typeof v === "string" && (EJECUTORES as readonly string[]).includes(v)
}
export function esEstado(v: unknown): v is Estado {
  return typeof v === "string" && (ESTADOS as readonly string[]).includes(v)
}
export function esFecha(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)
}
export function esHora(v: unknown): v is string {
  return typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v)
}
export function esClave(v: unknown): v is string {
  return typeof v === "string" && /^[a-z0-9][a-z0-9-]{1,60}$/.test(v)
}

/* ── Fechas ───────────────────────────────────────────────────────────────── */

/** Día de la semana de un `YYYY-MM-DD`, 0 = domingo. Por UTC para que no
 *  dependa de la zona de quien lo mire. */
export function diaSemana(iso: string): number {
  const [a, m, d] = iso.split("-").map(Number)
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay()
}

/** El lunes de la semana de `iso`. */
export function lunesDe(iso: string): string {
  return sumarDias(iso, -((diaSemana(iso) + 6) % 7))
}

/** `2026-10-28` → `28 de octubre`. */
export function fechaCorta(iso: string): string {
  const [, m, d] = iso.split("-").map(Number)
  return `${d} de ${MESES[m - 1]}`
}

/** Fecha y hora de Argentina de un instante: `["2026-10-28", "09:04"]`. */
export function enArgentina(instante: string): [string, string] {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instante))
  const p = (t: string) => partes.find((x) => x.type === t)?.value ?? ""
  return [`${p("year")}-${p("month")}-${p("day")}`, `${p("hour")}:${p("minute")}`]
}

export function ahoraArgentina(): [string, string] {
  return enArgentina(new Date().toISOString())
}

/* ── Repeticiones ─────────────────────────────────────────────────────────── */

export type Ocurrencia = { entrada: Entrada; fecha: string }

/**
 * Los días de `desde` a `hasta` (ambos inclusive) en que cae una entrada.
 *
 * Las continuas no tienen ocurrencias: se muestran aparte, con su última
 * corrida, porque dibujarlas serían decenas de tarjetas por día.
 */
export function ocurrencias(e: Entrada, desde: string, hasta: string): string[] {
  if (e.repeticion === "continua") return []
  const inicio = e.fecha > desde ? e.fecha : desde
  const fin = e.hasta && e.hasta < hasta ? e.hasta : hasta
  if (inicio > fin) return []
  if (e.repeticion === "nunca") return e.fecha >= desde && e.fecha <= hasta ? [e.fecha] : []

  const dias = e.diasSemana.length > 0 ? e.diasSemana : [diaSemana(e.fecha)]
  const diaDelMes = Number(e.fecha.slice(8))
  const salida: string[] = []
  for (let f = inicio; f <= fin; f = sumarDias(f, 1)) {
    if (e.repeticion === "diaria") salida.push(f)
    else if (e.repeticion === "semanal" && dias.includes(diaSemana(f))) salida.push(f)
    // Un mensual del 31 cae el último día en los meses cortos: si no, en
    // febrero desaparece y nadie se entera.
    else if (e.repeticion === "mensual" && Number(f.slice(8)) === Math.min(diaDelMes, finDeMes(f))) {
      salida.push(f)
    }
  }
  return salida
}

/** Último día del mes de `iso`: el 28 más cuatro días cae siempre en el mes
 *  siguiente, y el día anterior al 1 de ese mes es el que se busca. */
function finDeMes(iso: string): number {
  const siguiente = sumarDias(`${iso.slice(0, 8)}28`, 4)
  return Number(sumarDias(`${siguiente.slice(0, 8)}01`, -1).slice(8))
}

/** Todas las ocurrencias de un rango, ordenadas por día y hora. */
export function ocurrenciasDelRango(entradas: Entrada[], desde: string, hasta: string): Ocurrencia[] {
  return entradas
    .flatMap((e) => ocurrencias(e, desde, hasta).map((fecha) => ({ entrada: e, fecha })))
    .sort(
      (a, b) =>
        a.fecha.localeCompare(b.fecha) ||
        (a.entrada.hora ?? "").localeCompare(b.entrada.hora ?? "") ||
        a.entrada.titulo.localeCompare(b.entrada.titulo, "es")
    )
}

/** La próxima vez que toca, mirando hasta un año adelante. Hoy cuenta sólo si
 *  todavía no pasó la hora. */
export function proxima(e: Entrada, [hoy, hora]: [string, string]): string | null {
  if (e.repeticion === "continua") return null
  const desde = e.hora && e.hora <= hora ? sumarDias(hoy, 1) : hoy
  return ocurrencias(e, desde, sumarDias(hoy, 366))[0] ?? null
}

/** "Lunes y jueves a las 09:00", "Todos los días a las 00:00". */
export function describirRepeticion(e: Pick<Entrada, "repeticion" | "diasSemana" | "fecha" | "hora" | "intervaloMin">): string {
  const aLas = e.hora ? ` a las ${e.hora}` : ""
  switch (e.repeticion) {
    case "nunca":
      return `${fechaCorta(e.fecha)}${aLas}`
    case "diaria":
      return `Todos los días${aLas}`
    case "semanal": {
      const dias = (e.diasSemana.length > 0 ? e.diasSemana : [diaSemana(e.fecha)])
        .slice()
        .sort((a, b) => ORDEN_SEMANA.indexOf(a) - ORDEN_SEMANA.indexOf(b))
        .map((d) => DIAS_LARGOS[d])
      const lista = dias.length > 1 ? `${dias.slice(0, -1).join(", ")} y ${dias.at(-1)}` : dias[0]
      return `${lista.charAt(0).toUpperCase()}${lista.slice(1)}${aLas}`
    }
    case "mensual":
      return `El ${Number(e.fecha.slice(8))} de cada mes${aLas}`
    case "continua":
      return e.intervaloMin ? `Cada ${e.intervaloMin} minutos` : "Cada pocos minutos"
  }
}

/* ── Corridas ─────────────────────────────────────────────────────────────── */

/**
 * Cómo salió una ocurrencia de un agente o proceso.
 *
 *   ok        avisó que corrió bien ese día
 *   fallo     avisó, y salió mal (si hubo una buena después, gana la buena)
 *   falta     ya pasó la hora y no avisó nada — lo que este calendario existe
 *             para mostrar
 *   pendiente todavía no le tocó
 *   sin-dato  planificado, pausado o sin clave: no hay nada que esperar
 */
export type EstadoOcurrencia = "ok" | "fallo" | "falta" | "pendiente" | "sin-dato"

/** Margen antes de dar por perdida una corrida: los crons de GitHub se
 *  demoran cuando hay cola, a veces varios minutos. */
const MARGEN_MIN = 90

export function estadoDeOcurrencia(
  e: Entrada,
  fecha: string,
  corridasDelDia: Corrida[],
  ahora: [string, string] = ahoraArgentina()
): EstadoOcurrencia {
  if (e.tipo === "persona" || !e.clave) return "sin-dato"
  if (corridasDelDia.some((c) => c.ok)) return "ok"
  if (corridasDelDia.length > 0) return "fallo"
  if (e.estado !== "activo" || fecha <= e.creadaEl) return "sin-dato"

  const [hoy, hora] = ahora
  if (fecha > hoy) return "pendiente"
  if (fecha < hoy) return "falta"
  if (!e.hora) return "pendiente"
  return minutos(hora) - minutos(e.hora) > MARGEN_MIN ? "falta" : "pendiente"
}

function minutos(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number)
  return h * 60 + m
}

/** Corridas agrupadas por clave y por día de Argentina: `"sync-productos|2026-10-28"`. */
export function indexarCorridas(corridas: Corrida[]): Map<string, Corrida[]> {
  const mapa = new Map<string, Corrida[]>()
  for (const c of corridas) {
    const k = `${c.clave}|${enArgentina(c.inicio)[0]}`
    const lista = mapa.get(k)
    if (lista) lista.push(c)
    else mapa.set(k, [c])
  }
  return mapa
}

/** "28 de octubre, 00:04 — 312 productos". */
export function describirCorrida(c: Corrida): string {
  const [fecha, hora] = enArgentina(c.inicio)
  const cuando = `${fechaCorta(fecha)}, ${hora}`
  return c.detalle ? `${cuando} — ${c.detalle}` : cuando
}

export { hoyArgentina, sumarDias }
