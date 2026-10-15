/**
 * El CRM: los proyectos que cada persona del equipo está trabajando.
 *
 * Cada fila es un proyecto con una persona de una empresa. Una cuenta grande
 * tiene muchos a la vez, con la misma persona o con otras, y cada uno se sigue
 * aparte: etapa, porcentaje de cierre, próxima acción, historial, presupuesto.
 *
 * Se mira de a un dueño por vez —el tuyo, el de Sofía, el de Carlos— y cada uno
 * edita solo el suyo (los admins, todos). Un contacto entra acá desde Marketing
 * → Contactos, seleccionándolo y mandándolo, igual que un producto del
 * inventario pasa a Nuestros Productos.
 */

export const ESTADOS_CRM = [
  "nuevo",
  "calificacion",
  "propuesta",
  "negociacion",
  "ganada",
  "perdida",
] as const

export type EstadoCrm = (typeof ESTADOS_CRM)[number]

export const ESTADO_CRM_LABEL: Record<EstadoCrm, string> = {
  nuevo: "En seguimiento",
  calificacion: "Calificación",
  propuesta: "Propuesta",
  negociacion: "En negociación",
  ganada: "Cerrado/Ganado",
  perdida: "Cerrado/Perdido",
}

/**
 * El color de cada etapa. Son colores de categoría —como los de los avatares—
 * y no de semáforo: "Propuesta" no es ni bien ni mal, es un lugar del embudo.
 * Solo ganada y perdida usan los tonos de estado.
 */
export const ESTADO_CRM_ESTILO: Record<EstadoCrm, { chip: string; punto: string; barra: string }> = {
  nuevo: { chip: "border-line bg-surface-muted text-ink-secondary", punto: "bg-n-400", barra: "bg-n-300" },
  calificacion: { chip: "border-cyan-200 bg-cyan-50 text-cyan-800", punto: "bg-cyan-500", barra: "bg-cyan-400" },
  propuesta: { chip: "border-violet-200 bg-violet-50 text-violet-700", punto: "bg-violet-500", barra: "bg-violet-400" },
  negociacion: { chip: "border-brand-200 bg-brand-50 text-brand-700", punto: "bg-brand-500", barra: "bg-brand-500" },
  ganada: { chip: "border-success-line bg-success-soft text-success-text", punto: "bg-success", barra: "bg-success" },
  perdida: { chip: "border-danger-line bg-danger-soft text-danger-text", punto: "bg-danger", barra: "bg-danger" },
}

/** Los escalones del porcentaje de cierre. */
export const PORCENTAJES = [0, 25, 50, 75, 100] as const

/** El escalón más cercano: lo que venga suelto (un 70, un "30") cae en uno. */
export const aPorcentaje = (n: number) =>
  PORCENTAJES.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a), 0 as number)

/**
 * El porcentaje de cierre y el estado se mueven juntos:
 *   · 100% es ganado, y ganado es 100%.
 *   · Perdido es 0%.
 *   · Si deja de estar ganado (otra etapa, o un % menor), queda en 75% y
 *     En negociación: estaba por cerrarse.
 * Recibe cómo estaba y lo que se pidió; devuelve el estado y el % que quedan.
 * La usan la pantalla (para mostrarlo en el acto) y el servidor (que manda).
 */
export function reglaDeCierre(
  antes: { estado: EstadoCrm; probabilidad: number },
  pedido: { estado?: EstadoCrm; probabilidad?: number }
): { estado: EstadoCrm; probabilidad: number } {
  let estado = pedido.estado ?? antes.estado
  let probabilidad = aPorcentaje(pedido.probabilidad ?? antes.probabilidad)

  if (pedido.estado !== undefined && pedido.estado !== antes.estado) {
    if (estado === "ganada") probabilidad = 100
    else if (estado === "perdida") probabilidad = 0
    else if (antes.estado === "ganada" && pedido.probabilidad === undefined) probabilidad = 75
  } else if (pedido.probabilidad !== undefined && probabilidad !== antes.probabilidad) {
    if (probabilidad === 100) estado = "ganada"
    else if (antes.estado === "ganada") estado = "negociacion"
  }

  // Lo que quede tiene que ser coherente, venga como venga.
  if (estado === "ganada") probabilidad = 100
  else if (estado === "perdida") probabilidad = 0
  else if (probabilidad === 100) probabilidad = 75
  return { estado, probabilidad }
}

/** Las próximas acciones vencidas o de hoy del CRM propio (el número del menú). */
export const URL_PENDIENTES_CRM = "/api/comercial/crm/pendientes"

/** El `owner` de la vista con los CRM de todos juntos. */
export const EQUIPO = "equipo"

/** Días sin movimiento a partir de los cuales una oportunidad abierta está estancada. */
export const DIAS_ESTANCADA = 14

export const diasDesde = (fecha: string) =>
  Math.floor((Date.now() - new Date(fecha).getTime()) / 86_400_000)

export const esEstancada = (o: { estado: EstadoCrm; ultimoMovimiento: string }) =>
  ESTA_ABIERTA(o.estado) && diasDesde(o.ultimoMovimiento) >= DIAS_ESTANCADA

export const esEstadoCrm = (v: unknown): v is EstadoCrm =>
  typeof v === "string" && (ESTADOS_CRM as readonly string[]).includes(v)

export const ESTA_ABIERTA = (e: EstadoCrm) => e !== "ganada" && e !== "perdida"

/** Para nombrar un proyecto: lo que más se vende. El campo es libre. */
export const PROYECTOS_SUGERIDOS = [
  "Firma biométrica",
  "Software & AI",
  "Ciberseguridad",
  "Networking",
  "Data Center",
  "Consultoría Microsoft",
  "UPS",
]

export const MOTIVOS_PERDIDA = [
  "Presupuesto",
  "Eligió a la competencia",
  "Sin respuesta",
  "No era el momento",
  "No califica",
  "Otro",
]

export type ContactoCrm = {
  id: string
  empresa: string
  nombre: string | null
  apellido: string | null
  cargo: string | null
  departamento: string | null
  vertical: string | null
  email: string | null
  telefono: string | null
  observaciones: string | null
  amId: string | null
  amNombre: string | null
}

export type Oportunidad = {
  id: string
  ownerId: string
  ownerNombre: string
  /** El nombre del proyecto. En la base es la columna `producto`. */
  proyecto: string | null
  estado: EstadoCrm
  proximaAccion: string | null
  fechaProxima: string | null
  ultimoContacto: string | null
  probabilidad: number
  montoUsd: number | null
  motivoPerdida: string | null
  notas: string | null
  createdAt: string
  updatedAt: string
  /** La última vez que pasó algo: un cambio, una nota, un contacto. */
  ultimoMovimiento: string
  /** El presupuesto creado desde la oportunidad, si lo hay. */
  presupuesto: { id: string; numero: number; referencia: string; estado: string } | null
  contacto: ContactoCrm
}

export type KpisCrm = {
  activas: number
  negociacion: number
  /** Próximas acciones vencidas o de los próximos 7 días. */
  proximas: number
  vencidas: number
  ganadas: number
  perdidas: number
}

/**
 * Los números de arriba, calculados de las filas. Del lado del navegador a
 * propósito: así un cambio de etapa los mueve en el acto, sin ir al servidor.
 */
export function calcularKpis(ops: Oportunidad[]): KpisCrm {
  const abiertas = ops.filter((o) => ESTA_ABIERTA(o.estado))
  const dias = abiertas.map((o) => diasHasta(o.fechaProxima))
  return {
    activas: abiertas.length,
    negociacion: abiertas.filter((o) => o.estado === "negociacion").length,
    proximas: dias.filter((d) => d !== null && d <= 7).length,
    vencidas: dias.filter((d) => d !== null && d < 0).length,
    ganadas: ops.filter((o) => o.estado === "ganada").length,
    perdidas: ops.filter((o) => o.estado === "perdida").length,
  }
}

export type PersonaCrm = { id: string; nombre: string; activas: number }

export type RespuestaCrm = {
  oportunidades: Oportunidad[]
  equipo: PersonaCrm[]
  yo: { id: string; nombre: string; admin: boolean }
  owner: { id: string; nombre: string }
  puedeEditar: boolean
  /** Para sugerir al nombrar un proyecto. */
  proyectos: string[]
}

export type OpcionesContacto = { empresas: string[]; verticales: string[]; departamentos: string[] }

export type TipoActividad = "nota" | "cambio_estado" | "llamada" | "reunion" | "email" | "alta"

export type Actividad = {
  id: string
  tipo: TipoActividad
  texto: string
  autorId: string | null
  autorNombre: string | null
  createdAt: string
}

/** Lo editable de una oportunidad, en camelCase. */
export type CambiosOportunidad = Partial<
  Pick<
    Oportunidad,
    | "proyecto"
    | "estado"
    | "proximaAccion"
    | "fechaProxima"
    | "ultimoContacto"
    | "probabilidad"
    | "montoUsd"
    | "motivoPerdida"
    | "notas"
  >
> & { presupuestoId?: string | null }

/** "2026-10-12" → días desde hoy (negativo = vencida). Fecha local, sin hora. */
export function diasHasta(fecha: string | null): number | null {
  if (!fecha) return null
  const [a, m, d] = fecha.split("-").map(Number)
  const objetivo = new Date(a, m - 1, d)
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  return Math.round((objetivo.getTime() - hoy.getTime()) / 86_400_000)
}

export function fechaCorta(fecha: string | null): string {
  if (!fecha) return "—"
  const [a, m, d] = fecha.slice(0, 10).split("-")
  return `${d}/${m}/${a.slice(2)}`
}
