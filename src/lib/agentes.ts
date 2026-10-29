/**
 * Agentes — lo que comparten la pantalla, la API y los scripts.
 *
 * Un agente es un script de `scripts/agentes/` que corre en GitHub Actions una
 * vez por semana: lee datos, le pide a Claude un análisis y deja el resultado
 * en `agentes_trabajos`. Nunca publica ni toca nada por su cuenta; cada
 * propuesta espera a que alguien la apruebe o la descarte acá.
 *
 * No confundir con los asistentes (el chat): esos contestan cuando les hablan,
 * estos trabajan solos y en horario.
 */

export const CLAVES = ["agente-blog", "agente-informe", "agente-redes", "agente-ads"] as const
export type ClaveAgente = (typeof CLAVES)[number]

export function esClaveAgente(v: unknown): v is ClaveAgente {
  return typeof v === "string" && (CLAVES as readonly string[]).includes(v)
}

export type FichaAgente = {
  clave: ClaveAgente
  nombre: string
  /** Qué hace, en una línea, para la tarjeta. */
  rol: string
  /** Cuándo corre, en criollo. El horario de verdad está en agentes.yml. */
  cuando: string
  /** Qué significa aprobar una propuesta de este agente. */
  aprobar: string
}

export const AGENTES: Record<ClaveAgente, FichaAgente> = {
  "agente-blog": {
    clave: "agente-blog",
    nombre: "Blog",
    rol: "Propone tres notas para /recursos: una guía, una nota y un caso.",
    cuando: "Domingos 10:00",
    aprobar: "Crea la nota como borrador en Marketing → Notas, con el índice armado.",
  },
  "agente-informe": {
    clave: "agente-informe",
    nombre: "Informe semanal",
    rol: "Junta Ads, redes, leads y blog de la semana y deja tres acciones.",
    cuando: "Lunes 08:00",
    aprobar: "Marca la acción como tomada.",
  },
  "agente-ads": {
    clave: "agente-ads",
    nombre: "Google Ads",
    rol: "Revisa gasto y términos de búsqueda y propone qué bloquear o ajustar.",
    cuando: "Lunes 09:00",
    aprobar: "Queda aprobada para aplicar. Se aplica a mano o pidiéndoselo a Claude, y se carga en Versiones de Ads.",
  },
  "agente-redes": {
    clave: "agente-redes",
    nombre: "Redes",
    rol: "Analiza LinkedIn, Instagram y Facebook y propone tres posts.",
    cuando: "Miércoles 09:00",
    aprobar: "Queda aprobado para copiar y cargar en Contenido.",
  },
}

/** El orden de la pantalla: primero lo que pide decisión. */
export const ORDEN: ClaveAgente[] = ["agente-blog", "agente-ads", "agente-redes", "agente-informe"]

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

export type UltimaCorrida = { inicio: string; ok: boolean; detalle: string | null }

export type EstadoAgente = {
  ficha: FichaAgente
  /** El estado de su entrada en el Calendario. */
  estado: "activo" | "planificado" | "pausado" | null
  ultimaCorrida: UltimaCorrida | null
  trabajos: Trabajo[]
}
