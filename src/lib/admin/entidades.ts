/**
 * Vocabulario común de clientes y proveedores.
 *
 * Las dos fichas comparten casi todo (razón social, CUIT, domicilio, contacto) y
 * se diferencian en poco: el cliente lleva vendedor asignado y admite consumidor
 * final; el proveedor no. Ese "poco" es la razón por la que las opciones viven
 * acá y no duplicadas en cada formulario — el día que se agregue una forma
 * jurídica, se agrega una vez.
 */

/** Qué ficha es. Clientes y proveedores comparten pantalla y difieren en tres
 *  cosas: el endpoint, las formas jurídicas ofrecidas y el campo de vendedor. */
export type TipoEntidad = "cliente" | "proveedor"

/* ── Origen ───────────────────────────────────────────────────────────────── */

export const ORIGENES = ["nacional", "exterior"] as const
export type Origen = (typeof ORIGENES)[number]

export const ORIGEN_LABEL: Record<Origen, string> = {
  nacional: "Nacional",
  exterior: "Del exterior",
}

export function esOrigen(v: unknown): v is Origen {
  return typeof v === "string" && ORIGENES.includes(v as Origen)
}

/* ── Forma jurídica ───────────────────────────────────────────────────────── */

export const FORMAS_JURIDICAS = [
  "responsable_inscripto",
  "monotributo",
  "consumidor_final",
  "exento",
] as const
export type FormaJuridica = (typeof FORMAS_JURIDICAS)[number]

export const FORMA_JURIDICA_LABEL: Record<FormaJuridica, string> = {
  responsable_inscripto: "Responsable inscripto",
  monotributo: "Monotributo",
  consumidor_final: "Consumidor final",
  exento: "Exento",
}

/**
 * Qué opciones ofrece cada ficha. Un proveedor consumidor final no existe —no
 * emite factura—, y ofrecerlo solo sirve para que alguien lo elija por error.
 */
export const FORMAS_CLIENTE: FormaJuridica[] = [
  "responsable_inscripto",
  "monotributo",
  "consumidor_final",
  "exento",
]

export const FORMAS_PROVEEDOR: FormaJuridica[] = [
  "responsable_inscripto",
  "monotributo",
  "exento",
]

export function esFormaJuridica(v: unknown): v is FormaJuridica {
  return typeof v === "string" && FORMAS_JURIDICAS.includes(v as FormaJuridica)
}

/* ── Provincias ───────────────────────────────────────────────────────────── */

/** Las 24 jurisdicciones. En una lista cerrada porque "Bs As", "BSAS" y "Buenos
 *  Aires" escritas a mano hacen que después no se pueda agrupar por provincia. */
export const PROVINCIAS = [
  "Ciudad Autónoma de Buenos Aires",
  "Buenos Aires",
  "Catamarca",
  "Chaco",
  "Chubut",
  "Córdoba",
  "Corrientes",
  "Entre Ríos",
  "Formosa",
  "Jujuy",
  "La Pampa",
  "La Rioja",
  "Mendoza",
  "Misiones",
  "Neuquén",
  "Río Negro",
  "Salta",
  "San Juan",
  "San Luis",
  "Santa Cruz",
  "Santa Fe",
  "Santiago del Estero",
  "Tierra del Fuego",
  "Tucumán",
] as const

/* ── La ficha ─────────────────────────────────────────────────────────────── */

/**
 * Cómo viaja una entidad entre la API y la UI. En camelCase: la base habla
 * snake_case y la conversión se hace en el handler, igual que en el resto del
 * proyecto.
 */
export type Entidad = {
  id: string
  razonSocial: string
  origen: Origen
  /** 11 dígitos sin guiones, o null. El formato es cosa de la pantalla. */
  cuit: string | null
  formaJuridica: FormaJuridica | null
  contacto: string | null
  direccion: string | null
  provincia: string | null
  telefono: string | null
  email: string | null
  condicionPagoDias: number | null
  notas: string | null
  activo: boolean
  createdAt: string
}

export type Cliente = Entidad & {
  vendedorId: string | null
  vendedorNombre: string | null
}

export type Vendedor = { id: string; nombre: string }

/* ── Validación compartida por el formulario y el handler ─────────────────── */

/**
 * Un email "suficientemente parecido a un email". No se usa la expresión
 * exhaustiva del RFC a propósito: rechazar una dirección rara y válida es peor
 * que aceptar una inválida, porque el campo es opcional y no se le manda nada
 * automáticamente.
 */
export function emailPlausible(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export const LARGO_MAX = {
  razonSocial: 200,
  texto: 200,
  notas: 2000,
} as const

/** Texto de formulario → lo que se guarda. Vacío es `null`, no cadena vacía: si
 *  no, después no se distingue "no lo cargaron" de "no tiene". */
export function textoONull(v: unknown, max: number = LARGO_MAX.texto): string | null {
  if (typeof v !== "string") return null
  const limpio = v.trim().slice(0, max)
  return limpio.length > 0 ? limpio : null
}
