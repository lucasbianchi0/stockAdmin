/**
 * La base de contactos de marketing.
 *
 * Es gente, no ventas: quién es, dónde trabaja y cómo se lo ubica. El estado de
 * una venta vive en el CRM de cada uno (`@/lib/comercial/crm`), y lo único que
 * esta base sabe de eso es en qué CRM está cada contacto, para marcarlo en la
 * tabla como Nuestros Productos marca lo que ya se eligió.
 */

/** En qué CRM está un contacto. */
/** Un proyecto de la persona en el CRM de alguien. Puede tener varios en el mismo. */
export type EnCrm = {
  id: string
  proyecto: string | null
  ownerId: string
  ownerNombre: string
  estado: string
  probabilidad: number
}

export type Contacto = {
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
  createdAt: string
  crm: EnCrm[]
}

export type KpisContactos = {
  total: number
  empresas: number
  verticales: number
  enSeguimiento: number
}

export type OpcionesContactos = {
  empresas: string[]
  verticales: string[]
  departamentos: string[]
}

export type RespuestaContactos = {
  contactos: Contacto[]
  /** Cuántas personas hay cargadas de cada empresa de la página. */
  porEmpresa?: Record<string, number>
  total: number
  /** Las pestañas, con los filtros y la búsqueda puestos. */
  conteos: { todos: number; libres: number; sinAm: number }
}

export type ResumenContactos = { kpis: KpisContactos; opciones: OpcionesContactos }

/** Lo que se edita de un contacto: lo de arriba sin lo que pone el sistema. */
export type BorradorContacto = {
  empresa: string
  nombre: string
  apellido: string
  cargo: string
  departamento: string
  vertical: string
  email: string
  telefono: string
  observaciones: string
  amId: string | null
}

export const BORRADOR_VACIO: BorradorContacto = {
  empresa: "",
  nombre: "",
  apellido: "",
  cargo: "",
  departamento: "",
  vertical: "",
  email: "",
  telefono: "",
  observaciones: "",
  amId: null,
}

export const LIMITE_TEXTO = 300
export const LIMITE_OBSERVACIONES = 2000

export const nombreCompleto = (c: Pick<Contacto, "nombre" | "apellido">) =>
  [c.nombre, c.apellido].filter(Boolean).join(" ")

export const esEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)

/* ── Importación ──────────────────────────────────────────────────────────── */

/** Lo que se lee de una planilla. `nombreCompleto` es la columna única de
 *  "Nombre y apellido", que después se parte en dos. */
export type CampoImportable =
  | Exclude<keyof BorradorContacto, "amId">
  | "am"
  | "nombreCompleto"

export const ETIQUETA_CAMPO: Record<CampoImportable, string> = {
  empresa: "Empresa",
  nombre: "Nombre",
  apellido: "Apellido",
  nombreCompleto: "Nombre y apellido",
  cargo: "Cargo",
  departamento: "Departamento",
  vertical: "Vertical",
  email: "Email",
  telefono: "Teléfono",
  observaciones: "Observaciones",
  am: "AM",
}

export const COLUMNAS_PLANTILLA = [
  "AM",
  "Empresa",
  "Nombre",
  "Apellido",
  "Cargo",
  "Departamento",
  "Vertical",
  "Email",
  "Teléfono",
  "Observaciones",
]

/** Los datos de una fila, ya limpios. */
export type DatosImportados = Omit<BorradorContacto, "amId"> & { am: string }

/**
 * Una fila de la planilla con su veredicto:
 *   nuevo     → se suma
 *   duplicado → la persona ya está en la base (mismo mail, o mismo nombre y
 *               empresa si no hay mail). Puede completarle lo que le falte.
 *   repetido  → aparece más de una vez en la misma planilla; vale la primera.
 *
 * `fila` es el orden entre las filas con datos (#1, #2…), no la fila de Excel.
 *   error     → le falta algo que no se puede adivinar.
 */
export type FilaImportada = {
  fila: number
  datos: DatosImportados
  /** El AM de la planilla, resuelto contra el equipo. */
  amId: string | null
  estado: "nuevo" | "duplicado" | "repetido" | "error"
  motivo?: string
  /** Si es duplicado: la ficha que ya existe… */
  existenteId?: string
  /** …y los campos vacíos de esa ficha que la planilla podría completar. */
  completaria?: CampoImportable[]
  /** Lo que se corrigió al leer la fila ("mail con nombre", "mayúsculas"…). */
  arreglos?: string[]
}

export type PrevisualizacionImport = {
  filas: FilaImportada[]
  columnasReconocidas: CampoImportable[]
  columnasIgnoradas: string[]
  /** En qué fila con contenido estaban los encabezados (1 = la primera). */
  filaCabecera: number
  /** Si el CSV vino en la codificación vieja de Excel y se convirtió. */
  recodificado: boolean
}

export const FILAS_IMPORT_MAX = 2000

/* ── Grupos ───────────────────────────────────────────────────────────────── */

/**
 * Una lista con nombre de personas de Contactos. Es la base de las campañas:
 * una campaña va a tener un grupo como destinatarios.
 */
export type Grupo = {
  id: string
  nombre: string
  descripcion: string | null
  miembros: number
  creadoPor: string | null
  createdAt: string
}

/* ── Campañas ─────────────────────────────────────────────────────────────── */

/**
 * Un mensaje para un grupo. Por ahora solo en borrador: el envío desde la app
 * todavía no existe (ver la migración de `campanas`).
 */
export type Campana = {
  id: string
  nombre: string
  grupoId: string
  grupoNombre: string
  destinatarios: number
  plantillaId: string | null
  plantillaTitulo: string | null
  canal: "email" | "whatsapp"
  estado: "borrador" | "programada" | "enviando" | "enviada" | "cancelada"
  origen: "contactos" | "crm"
  creadoPor: string | null
  createdAt: string
}
