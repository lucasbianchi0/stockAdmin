/**
 * Agentes — lo que comparten la pantalla, la API y los scripts.
 *
 * Un agente es un script de `scripts/agentes/` que corre en GitHub Actions una
 * vez por semana: lee datos, le pide a Claude un análisis y deja el resultado
 * en `agentes_trabajos`. Nunca publica ni toca nada por su cuenta; cada
 * propuesta espera a que alguien la apruebe o la descarte.
 *
 * No confundir con los asistentes (el chat): esos contestan cuando les hablan,
 * estos trabajan solos y en horario.
 */

export const CLAVES = ["agente-blog", "agente-informe", "agente-redes", "agente-ads"] as const
export type ClaveAgente = (typeof CLAVES)[number]

export function esClaveAgente(v: unknown): v is ClaveAgente {
  return typeof v === "string" && (CLAVES as readonly string[]).includes(v)
}

/** La URL de la ficha: /agentes/blog y no /agentes/agente-blog. */
export const slugDeAgente = (clave: ClaveAgente) => clave.replace(/^agente-/, "")
export function claveDeSlug(slug: string): ClaveAgente | null {
  const clave = `agente-${slug}`
  return esClaveAgente(clave) ? clave : null
}

/**
 * Los colores de cada agente, como clases enteras: Tailwind sólo genera las
 * que encuentra escritas tal cual en el código.
 */
export type Tema = {
  /** El fondo del avatar, igual al de la ilustración. */
  fondo: string
  /** Un lavado muy suave para superficies grandes. */
  lavado: string
  texto: string
  borde: string
  punto: string
  /** El degradé de la cabecera de la ficha. */
  degrade: string
  anillo: string
}

export type FichaAgente = {
  clave: ClaveAgente
  /** Su nombre propio, el que se ve primero. */
  apodo: string
  /** Qué es: "Agente del blog". */
  nombre: string
  /** Qué hace, en una línea, para la tarjeta. */
  rol: string
  /** Lo que hace, en dos o tres oraciones, para la ficha. */
  descripcion: string
  /** Qué datos mira. */
  lee: string[]
  /** Día de la semana (0 = domingo) y hora de Argentina. Igual que agentes.yml. */
  dia: number
  hora: string
  /** Qué significa aprobar una propuesta de este agente. */
  aprobar: string
  avatar: string
  tema: Tema
}

export const AGENTES: Record<ClaveAgente, FichaAgente> = {
  "agente-blog": {
    clave: "agente-blog",
    apodo: "Pluma",
    nombre: "Agente del blog",
    rol: "Propone tres notas para /recursos cada domingo.",
    descripcion:
      "Cruza lo que ya está publicado en /recursos con lo que la gente buscó en Google Ads y trae tres notas para escribir: una guía, una nota y un caso. No redacta sola: la que apruebes nace como borrador con el índice armado.",
    lee: ["Notas publicadas y borradores", "Términos de búsqueda de Ads (30 días)", "Sus propuestas anteriores"],
    dia: 0,
    hora: "10:00",
    aprobar: "Crea la nota como borrador en Marketing → Notas, con los subtítulos puestos.",
    avatar: "/agentes/agente-blog.webp",
    tema: {
      fondo: "bg-[#E9E4FF]",
      lavado: "bg-violet-50/70",
      texto: "text-violet-700",
      borde: "border-violet-200",
      punto: "bg-violet-500",
      degrade: "from-[#E9E4FF] via-violet-50 to-transparent",
      anillo: "ring-violet-200",
    },
  },
  "agente-informe": {
    clave: "agente-informe",
    apodo: "Dato",
    nombre: "Analista semanal",
    rol: "Arma el informe de la semana y deja tres acciones.",
    descripcion:
      "Los lunes temprano junta Google Ads, leads, LinkedIn, Instagram, Facebook y el blog, los compara con la semana anterior y te deja lo importante en un texto, con las tres cosas para hacer esta semana.",
    lee: ["Google Ads", "Leads", "LinkedIn", "Instagram y Facebook", "Notas publicadas"],
    dia: 1,
    hora: "08:00",
    aprobar: "Marca la acción como tomada.",
    avatar: "/agentes/agente-informe.webp",
    tema: {
      fondo: "bg-[#DDF5EC]",
      lavado: "bg-teal-50/70",
      texto: "text-teal-700",
      borde: "border-teal-200",
      punto: "bg-teal-500",
      degrade: "from-[#DDF5EC] via-teal-50 to-transparent",
      anillo: "ring-teal-200",
    },
  },
  "agente-ads": {
    clave: "agente-ads",
    apodo: "Diana",
    nombre: "Agente de Google Ads",
    rol: "Revisa gasto y búsquedas y propone qué bloquear o ajustar.",
    descripcion:
      "Mira la semana de las campañas contra la anterior y cada término de búsqueda que gastó plata. Propone negativas, keywords y ajustes, cada uno con el número que lo justifica. Nunca toca la cuenta: lo aprobado se aplica a mano y se carga en Versiones de Ads.",
    lee: ["Campañas de la semana y la anterior", "Términos de búsqueda", "Últimas versiones de Ads"],
    dia: 1,
    hora: "09:00",
    aprobar: "Queda aprobada para aplicar. Se aplica a mano o pidiéndoselo a Claude, y se carga en Versiones de Ads.",
    avatar: "/agentes/agente-ads.webp",
    tema: {
      fondo: "bg-[#FFE9D6]",
      lavado: "bg-orange-50/70",
      texto: "text-orange-700",
      borde: "border-orange-200",
      punto: "bg-orange-500",
      degrade: "from-[#FFE9D6] via-orange-50 to-transparent",
      anillo: "ring-orange-200",
    },
  },
  "agente-redes": {
    clave: "agente-redes",
    apodo: "Chispa",
    nombre: "Agente de redes",
    rol: "Analiza LinkedIn, Instagram y Facebook y propone tres posts.",
    descripcion:
      "Los miércoles revisa qué funcionó en las tres redes durante el último mes y escribe tres posts listos para pegar, apoyados en las notas recientes del blog. La imagen de Instagram se arma aparte, con el sistema del feed.",
    lee: ["Métricas diarias de LinkedIn", "Métricas de Instagram y Facebook", "Publicaciones del último mes", "Notas recientes"],
    dia: 3,
    hora: "09:00",
    aprobar: "Queda aprobado para copiar y cargar en Contenido.",
    avatar: "/agentes/agente-redes.webp",
    tema: {
      fondo: "bg-[#FFE3EF]",
      lavado: "bg-pink-50/70",
      texto: "text-pink-700",
      borde: "border-pink-200",
      punto: "bg-pink-500",
      degrade: "from-[#FFE3EF] via-pink-50 to-transparent",
      anillo: "ring-pink-200",
    },
  },
}

/** El orden del equipo: primero los que piden decisiones. */
export const ORDEN: ClaveAgente[] = ["agente-blog", "agente-ads", "agente-redes", "agente-informe"]

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"]

/** "Domingos 10:00", "Lunes 08:00": el plural sólo suma la s a los que no la tienen. */
export function cuandoCorre(f: FichaAgente): string {
  const dia = DIAS[f.dia]
  const plural = dia.endsWith("s") ? dia : `${dia}s`
  return `${plural[0].toUpperCase()}${plural.slice(1)} ${f.hora}`
}

/**
 * La próxima corrida, como instante. La hora de Argentina se pasa a UTC con el
 * -03:00 fijo: no hay horario de verano.
 */
export function proximaCorrida(f: FichaAgente, ahora = new Date()): Date {
  const hoy = new Date(ahora.getTime() - 3 * 3_600_000) // reloj de Argentina, en UTC
  for (let i = 0; i <= 7; i++) {
    const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate() + i))
    if (d.getUTCDay() !== f.dia) continue
    const cuando = new Date(`${d.toISOString().slice(0, 10)}T${f.hora}:00-03:00`)
    if (cuando > ahora) return cuando
  }
  return new Date(ahora.getTime() + 7 * 86_400_000)
}

export const ESTADOS_PROPUESTA = ["pendiente", "aprobada", "descartada"] as const
export type EstadoPropuesta = (typeof ESTADOS_PROPUESTA)[number]

export function esEstadoPropuesta(v: unknown): v is EstadoPropuesta {
  return typeof v === "string" && (ESTADOS_PROPUESTA as readonly string[]).includes(v)
}

/**
 * Una propuesta. Los campos opcionales son de un agente u otro; la pantalla
 * muestra los que vengan.
 */
export type Propuesta = {
  id: string
  titulo: string
  detalle: string
  estado: EstadoPropuesta
  // Blog
  tipo?: string
  categoria?: string
  keyword?: string
  intencion?: string
  puntos?: string[]
  porQue?: string
  /** La nota que se creó al aprobarla. */
  notaId?: string
  // Ads
  campana?: string
  dato?: string
  // Redes
  red?: string
  texto?: string
  ideaVisual?: string
}

export type Trabajo = {
  id: string
  clave: ClaveAgente
  titulo: string
  resumen: string
  propuestas: Propuesta[]
  /** Con qué datos trabajó: { "Ads": "ok" | "token vencido", … }. */
  fuentes: Record<string, string>
  revisadoPor: string | null
  revisadoEn: string | null
  creadoEn: string
}

export type Corrida = { inicio: string; ok: boolean; detalle: string | null; origen: string }

export type EstadoEntrada = "activo" | "planificado" | "pausado" | null

/** Lo que muestra la tarjeta del equipo. */
export type ResumenAgente = {
  clave: ClaveAgente
  estado: EstadoEntrada
  ultimaCorrida: Corrida | null
  /** Propuestas sin decidir, de todas sus entregas. */
  pendientes: number
  entregas: number
  ultimaEntrega: { titulo: string; creadoEn: string } | null
}

/** Lo que muestra la ficha. */
export type DetalleAgente = {
  clave: ClaveAgente
  estado: EstadoEntrada
  corridas: Corrida[]
  trabajos: Trabajo[]
}

/** Cuántas propuestas hay en cada estado. */
export function contarPropuestas(trabajos: Trabajo[]): Record<EstadoPropuesta, number> {
  const c: Record<EstadoPropuesta, number> = { pendiente: 0, aprobada: 0, descartada: 0 }
  for (const t of trabajos) for (const p of t.propuestas) c[p.estado]++
  return c
}
