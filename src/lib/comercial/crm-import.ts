import { clave } from "@/lib/marketing/contactos-import"
import { PORCENTAJES, aPorcentaje, type EstadoCrm } from "@/lib/comercial/crm"

/**
 * Leer una planilla de proyectos: la que cada comercial ya tiene armada en su
 * Excel, con una fila por proyecto ("Andreani · Juan Pérez · Firma en
 * sucursales · Propuesta · 50%").
 *
 * Lo que se encontró en planillas así, y que esto resuelve:
 *
 *   · La etapa escrita de mil formas: "Ganado", "cerrado/ganado", "WON",
 *     "cotizado", "en negociación".
 *   · El % como "75", "75%", "75,0" o 0.75 (una celda con formato de
 *     porcentaje en Excel guarda 0.75), y valores sueltos (70, 30).
 *   · Fechas que Excel guarda como número de serie (45945), o escritas
 *     15/10/26, 15-10-2026, 2026-10-15. Siempre día/mes, como acá.
 *   · Etapa y % que no se condicen ("Ganado" con 50%).
 *
 * Todo es puro: entra texto, sale el dato y una lista de lo que se corrigió.
 */

export type CampoProyecto =
  | "empresa"
  | "nombreCompleto"
  | "nombre"
  | "apellido"
  | "email"
  | "telefono"
  | "cargo"
  | "proyecto"
  | "estado"
  | "probabilidad"
  | "proximaAccion"
  | "fechaProxima"
  | "ultimoContacto"
  | "motivoPerdida"
  | "notas"
  | "dueno"

export const ETIQUETA_CAMPO_PROYECTO: Record<CampoProyecto, string> = {
  empresa: "Empresa",
  nombreCompleto: "Contacto",
  nombre: "Nombre",
  apellido: "Apellido",
  email: "Email",
  telefono: "Teléfono",
  cargo: "Cargo",
  proyecto: "Proyecto",
  estado: "Etapa",
  probabilidad: "% cierre",
  proximaAccion: "Próxima acción",
  fechaProxima: "Fecha próxima",
  ultimoContacto: "Último contacto",
  motivoPerdida: "Motivo de pérdida",
  notas: "Notas",
  dueno: "Dueño",
}

/** La plantilla que se descarga: en este orden. */
export const COLUMNAS_PLANTILLA_PROYECTOS = [
  "Empresa",
  "Contacto",
  "Email",
  "Cargo",
  "Proyecto",
  "Etapa",
  "% cierre",
  "Próxima acción",
  "Fecha próxima",
  "Último contacto",
  "Motivo de pérdida",
  "Notas",
  "Dueño",
]

/**
 * Cómo se puede llamar cada columna, ya normalizado (sin acentos ni signos:
 * "% cierre" queda "cierre"). Se compara contra el encabezado entero.
 */
const ALIAS: Record<CampoProyecto, string[]> = {
  empresa: ["empresa", "cliente", "cuenta", "compania", "company", "razon social", "organizacion", "account"],
  nombreCompleto: ["contacto", "nombre y apellido", "nombre completo", "persona", "apellido y nombre", "full name", "interlocutor"],
  nombre: ["nombre", "nombres", "first name", "name"],
  apellido: ["apellido", "apellidos", "last name", "surname"],
  email: ["email", "e mail", "mail", "correo", "correo electronico", "email contacto", "mail contacto"],
  telefono: ["telefono", "tel", "celular", "movil", "phone", "whatsapp", "cel"],
  cargo: ["cargo", "puesto", "rol", "title", "job title", "posicion"],
  proyecto: [
    "proyecto", "oportunidad", "negocio", "deal", "producto", "servicio", "solucion",
    "producto o servicio", "proyecto producto", "nombre del proyecto", "iniciativa",
  ],
  estado: ["etapa", "estado", "stage", "fase", "status", "estado de la propuesta", "estado del proyecto", "instancia"],
  probabilidad: [
    "cierre", "porcentaje de cierre", "de cierre", "probabilidad", "prob cierre", "probabilidad de cierre",
    "porcentaje", "avance", "prob", "forecast", "chance",
  ],
  proximaAccion: ["proxima accion", "siguiente paso", "proximo paso", "next step", "accion", "pendiente", "proxima tarea"],
  fechaProxima: [
    "fecha proxima", "fecha proxima accion", "fecha", "vencimiento", "fecha de seguimiento",
    "follow up", "fecha seguimiento", "proximo contacto", "fecha accion",
  ],
  ultimoContacto: ["ultimo contacto", "fecha ultimo contacto", "last contact", "ult contacto"],
  motivoPerdida: ["motivo de perdida", "motivo perdida", "motivo", "razon de perdida", "por que se perdio"],
  notas: ["notas", "nota", "observaciones", "observacion", "comentarios", "comentario", "notes", "detalle"],
  dueno: ["dueno", "responsable", "vendedor", "ejecutivo", "am", "owner", "comercial", "asignado", "account manager", "crm de"],
}

const normalizarCabecera = (s: string) => clave(s).replace(/[.@+]/g, " ").replace(/\s+/g, " ").trim()

export function mapearColumnasProyecto(cabeceras: string[]): Partial<Record<CampoProyecto, number>> {
  const normalizadas = cabeceras.map(normalizarCabecera)
  const mapa: Partial<Record<CampoProyecto, number>> = {}
  for (const [campo, alias] of Object.entries(ALIAS) as [CampoProyecto, string[]][]) {
    const i = normalizadas.findIndex((c, idx) => alias.includes(c) && !Object.values(mapa).includes(idx))
    if (i >= 0) mapa[campo] = i
  }
  return mapa
}

/** La fila de encabezados: la que más columnas reconoce entre las primeras diez. */
export function buscarCabeceraProyecto(filas: string[][]): number {
  let mejor = 0
  let max = -1
  for (let i = 0; i < Math.min(10, filas.length); i++) {
    const n = Object.keys(mapearColumnasProyecto(filas[i])).length
    if (n > max) {
      max = n
      mejor = i
    }
  }
  return mejor
}

/* ── Etapa ────────────────────────────────────────────────────────────────── */

const ETAPAS_EXACTAS: Record<string, EstadoCrm> = {}
const cargar = (estado: EstadoCrm, textos: string[]) => textos.forEach((t) => (ETAPAS_EXACTAS[t] = estado))
cargar("nuevo", ["nuevo", "en seguimiento", "seguimiento", "prospecto", "prospeccion", "lead", "contactado", "inicial", "abierto", "a contactar"])
cargar("calificacion", ["calificacion", "calificado", "calificando", "descubrimiento", "relevamiento", "analisis", "en analisis"])
cargar("propuesta", ["propuesta", "propuesta enviada", "cotizado", "cotizacion", "presupuesto", "presupuestado", "oferta", "enviada"])
cargar("negociacion", ["negociacion", "en negociacion", "negociando", "por cerrar", "cierre"])
cargar("ganada", ["ganada", "ganado", "cerrado ganado", "cerrada ganada", "won", "ganamos", "adjudicado", "adjudicada", "cerrado", "cerrada", "vendido", "ok"])
cargar("perdida", ["perdida", "perdido", "cerrado perdido", "cerrada perdida", "lost", "perdimos", "descartado", "descartada", "cancelado", "cancelada", "no va"])

/** La etapa escrita como venga. `null` si no se entiende (vacío no es error). */
export function leerEtapa(texto: string): { estado: EstadoCrm | null; entendida: boolean } {
  const k = clave(texto).replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim()
  if (!k) return { estado: null, entendida: true }
  if (ETAPAS_EXACTAS[k]) return { estado: ETAPAS_EXACTAS[k], entendida: true }
  // Por raíz: "propuesta técnica enviada", "en negociación final".
  if (/perdid|descart|cancel/.test(k)) return { estado: "perdida", entendida: true }
  if (/ganad|adjudic|won/.test(k)) return { estado: "ganada", entendida: true }
  if (/negoci/.test(k)) return { estado: "negociacion", entendida: true }
  if (/propuest|cotiz|presupuest/.test(k)) return { estado: "propuesta", entendida: true }
  if (/calific|relev/.test(k)) return { estado: "calificacion", entendida: true }
  if (/seguim|nuevo|prospect|lead|contact/.test(k)) return { estado: "nuevo", entendida: true }
  return { estado: null, entendida: false }
}

/* ── Porcentaje ───────────────────────────────────────────────────────────── */

/**
 * El % de cierre. Una celda con formato de porcentaje en Excel guarda la
 * fracción (0.75); un número de 0 a 1 sin "%" se lee así. Lo que no cae en un
 * escalón se lleva al más cercano, avisando.
 */
export function leerPorcentaje(texto: string): { valor: number | null; nota?: string } {
  const t = texto.trim()
  if (!t) return { valor: null }
  const conSigno = t.includes("%")
  const n = Number(t.replace("%", "").replace(",", ".").trim())
  if (!Number.isFinite(n) || n < 0) return { valor: null, nota: `% “${t}” no se entendió` }
  const porcentaje = !conSigno && n <= 1 ? n * 100 : n
  if (porcentaje > 100) return { valor: null, nota: `% “${t}” fuera de rango` }
  const valor = aPorcentaje(porcentaje)
  const redondeado = Math.round(porcentaje * 100) / 100
  return {
    valor,
    nota: (PORCENTAJES as readonly number[]).includes(redondeado) ? undefined : `${redondeado}% → ${valor}%`,
  }
}

/* ── Fechas ───────────────────────────────────────────────────────────────── */

const dosDigitos = (n: number) => String(n).padStart(2, "0")

function fechaValida(a: number, m: number, d: number): string | null {
  if (a < 100) a += 2000
  const f = new Date(Date.UTC(a, m - 1, d))
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return null
  if (a < 2000 || a > 2100) return null
  return `${a}-${dosDigitos(m)}-${dosDigitos(d)}`
}

/**
 * "2026-10-15" desde lo que venga: número de serie de Excel (días desde el
 * 30/12/1899), dd/mm/aaaa, dd-mm-aa, aaaa-mm-dd. Siempre día antes que mes.
 */
export function leerFecha(texto: string): { valor: string | null; nota?: string } {
  const t = texto.trim()
  if (!t) return { valor: null }
  if (/^\d{5}(\.\d+)?$/.test(t)) {
    const serie = Math.floor(Number(t))
    if (serie > 36500 && serie < 73000) {
      const f = new Date(Date.UTC(1899, 11, 30) + serie * 86_400_000)
      return { valor: `${f.getUTCFullYear()}-${dosDigitos(f.getUTCMonth() + 1)}-${dosDigitos(f.getUTCDate())}` }
    }
  }
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(t)
  if (m) {
    const v = fechaValida(Number(m[1]), Number(m[2]), Number(m[3]))
    if (v) return { valor: v }
  }
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(t)
  if (m) {
    const v = fechaValida(Number(m[3]), Number(m[2]), Number(m[1]))
    if (v) return { valor: v }
  }
  return { valor: null, nota: `fecha “${t}” no se entendió` }
}

/* ── Lo que viaja entre la vista previa y el confirmar ───────────────────── */

export type DatosProyectoImportado = {
  empresa: string
  nombre: string
  apellido: string
  email: string
  telefono: string
  cargo: string
  proyecto: string
  estado: EstadoCrm
  probabilidad: number
  // `null`: la planilla no lo trae. Al actualizar un proyecto, lo que no viene
  // no se toca (una celda vacía no borra lo que ya estaba cargado).
  proximaAccion: string | null
  fechaProxima: string | null
  ultimoContacto: string | null
  motivoPerdida: string | null
  notas: string | null
}

/**
 * Una fila con su veredicto:
 *   nuevo      entra como proyecto nuevo (con una persona existente o nueva)
 *   existente  esa persona ya tiene ese proyecto en ese CRM: no se duplica;
 *              `cambios` dice qué se actualizaría si se elige actualizar
 *   repetido   la misma persona y el mismo proyecto, más arriba en el archivo
 *   error      falta algo que no se puede adivinar
 */
export type FilaProyectoImportada = {
  fila: number
  datos: DatosProyectoImportado
  /** Si la fila trae etapa o %; si no, entra En seguimiento al 0%. */
  traeCierre: boolean
  ownerId: string | null
  ownerNombre: string | null
  /** La persona de Contactos a la que se engancha; `null`: se crea. */
  persona: { id: string; nombre: string } | null
  /**
   * Para las personas que se crean: la misma clave en todas sus filas, aunque
   * una traiga el mail y otra solo nombre y empresa. Se crea una vez.
   */
  personaNueva?: string
  estado: "nuevo" | "existente" | "repetido" | "error"
  motivo?: string
  proyectoId?: string
  cambios?: string[]
  /** Para revisar, sin frenar: "ya hay un proyecto igual con otra persona". */
  avisos?: string[]
  /** Lo que se corrigió al leer: "70% → 75%", "etapa ajustada a 100%". */
  arreglos?: string[]
}

export type PrevisualizacionProyectos = {
  filas: FilaProyectoImportada[]
  columnasReconocidas: CampoProyecto[]
  columnasIgnoradas: string[]
  filaCabecera: number
  recodificado: boolean
}

export const FILAS_IMPORT_PROYECTOS_MAX = 2000

