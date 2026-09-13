/**
 * Panel de resultados — el vocabulario compartido entre la pantalla y la API.
 *
 * Sin imports de servidor a propósito: lo usan el cliente, los handlers y las
 * funciones de formato. Las reglas de lectura viven una sola vez.
 *
 * LA DECISION QUE ORDENA TODO EL MODULO
 *
 * Un lead del propio equipo no es un lead. Suena obvio y sin embargo es el error
 * que este panel viene a corregir: medido el 13/9/2026, de diez leads en la base
 * ocho eran nuestros —tres marcados como internos y cinco que el filtro no veía
 * porque esas visitas nunca entraron con `?interno=1`—. Un panel que los cuenta
 * no exagera un poco: muestra ocho consultas donde hubo dos.
 *
 * Por eso `equipo` viaja en cada lead y el total nunca se muestra solo.
 */

/* ── Períodos ─────────────────────────────────────────────────────────────── */

/**
 * Las ventanas que ofrece la pantalla.
 *
 * No hay "hoy" ni "esta semana" a propósito. La cuenta hizo 135 clics en treinta
 * días: una semana son ~30 clics repartidos entre dos campañas, y con eso la
 * diferencia entre una buena y una mala semana es ruido. Ofrecer la ventana
 * invita a leerla, y leer ruido lleva a cambiar pujas que reinician el
 * aprendizaje del algoritmo. Siete días queda para control de daños —un anuncio
 * rechazado, un gasto disparado—, no para concluir nada.
 */
export const PERIODOS = ["7d", "30d", "90d", "12m"] as const
export type Periodo = (typeof PERIODOS)[number]

export const PERIODO_LABEL: Record<Periodo, string> = {
  "7d": "7 días",
  "30d": "30 días",
  "90d": "Trimestre",
  "12m": "12 meses",
}

export const PERIODO_DIAS: Record<Periodo, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "12m": 365,
}

/** `desde`/`hasta` inclusive, en formato ISO corto, para un período. */
export function rangoDe(periodo: Periodo, hoy = new Date()): { desde: string; hasta: string } {
  const hasta = new Date(hoy)
  const desde = new Date(hoy)
  desde.setDate(desde.getDate() - (PERIODO_DIAS[periodo] - 1))
  return { desde: iso(desde), hasta: iso(hasta) }
}

/** El mismo largo de ventana, inmediatamente anterior. Es contra qué se compara. */
export function rangoAnterior(periodo: Periodo, hoy = new Date()): { desde: string; hasta: string } {
  const dias = PERIODO_DIAS[periodo]
  const hasta = new Date(hoy)
  hasta.setDate(hasta.getDate() - dias)
  const desde = new Date(hasta)
  desde.setDate(desde.getDate() - (dias - 1))
  return { desde: iso(desde), hasta: iso(hasta) }
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/* ── El sitio ─────────────────────────────────────────────────────────────── */

export type Totales = {
  sesiones: number
  /** Visitas que llegaron con `gclid`, o sea desde un anuncio. */
  de_ads: number
  vistas: number
  /** Navegadores distintos. Cero para todo lo anterior al 13/9/2026. */
  visitantes: number
  sesiones_sin_visitante: number
  navegan: number
  rebotes: number
  /** Eventos que no son ver una página ni salir de ella. */
  interacciones: number
  /** Clics a WhatsApp, teléfono o mail: contacto real, sin nombre. */
  contactos_directos: number
  /**
   * Personas que llegaron por un anuncio y tocaron WhatsApp, teléfono o mail.
   * Una por gclid, sin equipo ni bots. Es lo que se sube como `Contacto directo`.
   */
  contactos_de_ads?: number
  leads: number
  leads_equipo: number
  leads_reales: number
  leads_de_ads: number
  ganados: number
  monto_ganado: number
  /** Segundos. Combina la medición del navegador con la resta entre vistas. */
  permanencia_media: number
  /** Cuántas vistas tienen scroll medido. Es el termómetro de la instrumentación. */
  con_scroll: number
}

export type PuntoSerie = { dia: string; sesiones: number; leads: number }
export type FilaOrigen = { origen: string; sesiones: number; leads: number }
export type FilaPagina = {
  path: string
  vistas: number
  visitantes: number
  salidas: number
  segundos: number
  /** Porcentaje promedio de la página que se llegó a ver. `null` hasta que haya datos. */
  scroll: number | null
  leads: number
}
export type Reparto = { clave: string; valor: number }

export type Sitio = {
  desde: string
  hasta: string
  totales: Totales
  serie: PuntoSerie[]
  origenes: FilaOrigen[]
  paginas: FilaPagina[]
  dispositivos: Reparto[]
  paises: Reparto[]
}

/* ── Leads ────────────────────────────────────────────────────────────────── */

export const ESTADOS = [
  "nuevo",
  "contactado",
  "calificado",
  "propuesta",
  "ganado",
  "perdido",
  "descartado",
] as const
export type Estado = (typeof ESTADOS)[number]

export const ESTADO_LABEL: Record<Estado, string> = {
  nuevo: "Nuevo",
  contactado: "Contactado",
  calificado: "Calificado",
  propuesta: "Propuesta enviada",
  ganado: "Ganado",
  perdido: "Perdido",
  descartado: "Descartado / spam",
}

export function esEstado(v: unknown): v is Estado {
  return typeof v === "string" && (ESTADOS as readonly string[]).includes(v)
}

/** Sólo `ganado` pide monto: es el único que alimenta el retorno. */
export const ESTADOS_CERRADOS: Estado[] = ["ganado", "perdido", "descartado"]

export type TipoLead = "contacto" | "brochure" | "evento" | "popup"

export const TIPO_LABEL: Record<TipoLead, string> = {
  contacto: "Consulta",
  brochure: "Brochure",
  evento: "Evento",
  popup: "Popup",
}

export function esTipoLead(v: unknown): v is TipoLead {
  return v === "contacto" || v === "brochure" || v === "evento" || v === "popup"
}

export type Lead = {
  id: string
  created_at: string
  nombre: string | null
  empresa: string | null
  email: string
  mensaje: string | null
  servicio: string | null
  estado: string
  monto: number | null
  moneda: string | null
  tipo: string
  detalle: string | null
  /** Nuestro. Ver el encabezado del archivo. */
  equipo: boolean
  origen: string
  campana: string | null
  keyword: string | null
  landing: string | null
  enviado_desde: string | null
  dispositivo: string | null
  pais: string | null
  paginas_vistas: number
  recorrido: string[]
  /** El identificador del clic del anuncio. Es lo que se le sube a Google. */
  gclid: string | null
  /** Cuándo se subió a Google como conversión. `null` = todavía no. */
  subida_en: string | null
  /**
   * Grupo de anuncios que lo trajo. No sale de la base: lo resuelve el servidor
   * contra `click_view` de Google, y sólo alcanza 90 días para atrás.
   */
  grupo?: string | null
}

/* ── Campañas ─────────────────────────────────────────────────────────────── */

export type Campana = {
  id: string
  nombre: string
  estado: string
  canal: string
  impresiones: number
  clics: number
  /** En la moneda de la cuenta (ARS), ya sin micros. */
  coste: number
  conversiones: number
  /** Leads nuestros atribuidos a esta campaña por `utm_campaign` o por `gclid`. */
  leads: number
}

/**
 * Por qué las campañas pueden no estar, sin que el panel se rompa.
 *
 * Google Ads es la única fuente de esta pantalla que está afuera. Si falla, las
 * otras tres pestañas tienen que seguir andando: el embudo del sitio y la
 * bandeja de leads no dependen de Google para nada. Por eso el error viaja como
 * dato y no como excepción.
 */
export type MotivoSinAds = "sin-credenciales" | "token-vencido" | "error"

export const MOTIVO_SIN_ADS: Record<MotivoSinAds, { titulo: string; ayuda: string }> = {
  "sin-credenciales": {
    titulo: "Falta configurar el acceso a Google Ads",
    ayuda:
      "El servidor no tiene las variables GOOGLE_ADS_*. Hasta que estén, esta pestaña muestra lo último guardado del cierre mensual.",
  },
  "token-vencido": {
    titulo: "El permiso de Google Ads se venció",
    ayuda:
      "Google caduca el token cada siete días mientras la app de OAuth siga sin publicar. Hay que regenerarlo, o publicar la app para que deje de pasar.",
  },
  error: {
    titulo: "Google Ads no contestó",
    ayuda: "Puede ser un corte momentáneo. Los meses cerrados se siguen viendo desde la base.",
  },
}

export type Ads =
  | { ok: true; campanas: Campana[]; desde: string; hasta: string; enVivo: boolean }
  | { ok: false; motivo: MotivoSinAds; detalle: string; campanas: Campana[] }

/**
 * Conversiones pendientes de informarle a Google.
 *
 * No es una métrica: es una cola de trabajo. Aparece en la bandeja cuando hay
 * algo para subir y desaparece cuando no.
 */
export type Conversiones = {
  /** Leads con gclid, no del equipo y todavía sin subir. */
  pendientes: number
  /** De esos, los que ya se cerraron como ganados. Son los que más enseñan. */
  ganados: number
  /** Ya informados a Google en este período. */
  subidas: number
  /**
   * Clics a WhatsApp, teléfono o mail desde un anuncio en los últimos 90 días.
   * No son cola: Google los lee solo cada día como `Contacto directo`.
   */
  contactosAutomaticos: number
}

export type Resultados = {
  sitio: Sitio
  anterior: Totales | null
  leads: Lead[]
  ads: Ads
  conversiones: Conversiones
}

/* ── Formato ──────────────────────────────────────────────────────────────── */

export function pesos(n: number): string {
  return `$${Math.round(n).toLocaleString("es-AR")}`
}

export function porcentaje(parte: number, total: number, decimales = 1): string {
  if (!total) return "—"
  return `${((parte / total) * 100).toLocaleString("es-AR", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  })}%`
}

export function duracion(segundos: number): string {
  if (!segundos || segundos < 1) return "—"
  const s = Math.round(segundos)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`
}

/**
 * Variación contra el período anterior. `null` cuando no hay con qué comparar o
 * cuando la base era cero — un "subió infinito%" no informa nada.
 */
export function variacion(ahora: number, antes: number | undefined | null): number | null {
  if (antes === undefined || antes === null || antes === 0) return null
  return ((ahora - antes) / antes) * 100
}
