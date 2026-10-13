import type { CampoImportable, DatosImportados } from "@/lib/marketing/contactos"

/**
 * Leer una planilla de contactos como viene en la vida real, no como debería.
 *
 * Las planillas de marketing se arman a mano, se pasan de mano en mano y se
 * exportan de tres sistemas distintos. Lo que se encontró en la práctica, y que
 * esto resuelve antes de que llegue a la base:
 *
 *   · Un título o filas vacías arriba de los encabezados.
 *   · "Nombre y apellido" en una sola columna.
 *   · CSV guardado por Excel en Windows (acentos rotos: "MarÃ­a").
 *   · "Juan Pérez <juan@empresa.com>", "mailto:…", dos mails en una celda.
 *   · NOMBRES EN MAYÚSCULAS.
 *   · Teléfonos que Excel convirtió en número ("5.49114E+12").
 *   · "banco provincia" y "Banco Provincia" como si fueran dos empresas.
 *
 * Todo es puro (sin base ni red): entra texto, sale texto.
 */

/** Sin acentos, minúscula, solo letras y números: para comparar, no para mostrar. */
export const clave = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9@.+]+/g, " ")
    .trim()

/* ── Encabezados ──────────────────────────────────────────────────────────── */

/**
 * Cómo se puede llamar cada columna. Se compara contra el encabezado entero
 * normalizado y nunca por "contiene": "nombre" y "nombre de la empresa" son
 * campos distintos.
 */
const ALIAS: Record<CampoImportable, string[]> = {
  empresa: ["empresa", "compania", "company", "cuenta", "razon social", "organizacion", "cliente", "account", "company name"],
  nombreCompleto: ["nombre y apellido", "nombre completo", "apellido y nombre", "contacto", "persona", "full name", "nombre apellido"],
  nombre: ["nombre", "nombres", "first name", "name", "primer nombre"],
  apellido: ["apellido", "apellidos", "last name", "surname"],
  cargo: ["cargo", "puesto", "rol", "title", "job title", "posicion", "funcion"],
  departamento: ["departamento", "area", "sector", "department", "gerencia"],
  vertical: ["vertical", "industria", "rubro", "industry", "segmento", "sector industrial"],
  email: ["email", "e mail", "mail", "correo", "correo electronico", "email address", "e mail corporativo", "mail corporativo"],
  telefono: ["telefono", "tel", "celular", "movil", "phone", "whatsapp", "telefono celular", "cel", "mobile", "phone number"],
  observaciones: ["observaciones", "observacion", "notas", "nota", "comentarios", "comentario", "notes"],
  am: ["am", "account manager", "responsable", "vendedor", "ejecutivo", "owner", "asignado"],
}

const normalizarCabecera = (s: string) => clave(s).replace(/[.@+]/g, " ").replace(/\s+/g, " ").trim()

export function mapearColumnas(cabeceras: string[]): Partial<Record<CampoImportable, number>> {
  const normalizadas = cabeceras.map(normalizarCabecera)
  const mapa: Partial<Record<CampoImportable, number>> = {}
  for (const [campo, alias] of Object.entries(ALIAS) as [CampoImportable, string[]][]) {
    const i = normalizadas.findIndex((c, idx) => alias.includes(c) && !Object.values(mapa).includes(idx))
    if (i >= 0) mapa[campo] = i
  }
  return mapa
}

/**
 * En qué fila están los encabezados: la que más columnas reconoce entre las
 * primeras diez. Un Excel con "Base de contactos — octubre" arriba y una fila
 * vacía tiene los encabezados en la 3, no en la 1.
 */
export function buscarCabecera(filas: string[][]): number {
  let mejor = 0
  let max = -1
  for (let i = 0; i < Math.min(10, filas.length); i++) {
    const n = Object.keys(mapearColumnas(filas[i])).length
    if (n > max) {
      max = n
      mejor = i
    }
  }
  return mejor
}

/* ── El archivo ───────────────────────────────────────────────────────────── */

/**
 * El texto de un CSV. Primero como UTF-8; si no es UTF-8 válido —Excel en
 * Windows guarda en Windows-1252—, se vuelve a leer en esa codificación. Sin
 * esto, "María" llega como "MarÃ­a" o con signos de pregunta.
 */
export function decodificarCsv(bytes: ArrayBuffer): { texto: string; recodificado: boolean } {
  try {
    return { texto: new TextDecoder("utf-8", { fatal: true }).decode(bytes), recodificado: false }
  } catch {
    return { texto: new TextDecoder("windows-1252").decode(bytes), recodificado: true }
  }
}

/* ── Las celdas ───────────────────────────────────────────────────────────── */

const espacios = (s: string) => s.replace(/[ \s]+/g, " ").trim()

/** "MARIA JOSE" → "Maria Jose"; "maría" → "María". Lo que ya viene mezclado se respeta. */
export function capitalizar(s: string): { valor: string; cambio: boolean } {
  const t = espacios(s)
  const todoMayus = t.length > 2 && t === t.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(t)
  const todoMinus = t.length > 1 && t === t.toLowerCase() && /[a-záéíóúñ]/.test(t)
  if (!todoMayus && !todoMinus) return { valor: t, cambio: false }
  const valor = t
    .toLowerCase()
    .replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, l: string) => sep + l.toUpperCase())
  return { valor, cambio: valor !== t }
}

const EMAIL = /[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/

/** El primer mail válido de la celda, en minúscula. Saca "mailto:", nombres y
 *  signos alrededor, y se queda con el primero si hay varios. */
export function limpiarEmail(s: string): { valor: string; cambio: boolean } {
  const t = espacios(s)
  if (!t) return { valor: "", cambio: false }
  const m = t.match(EMAIL)
  if (!m) return { valor: t.toLowerCase(), cambio: false }
  const valor = m[0].toLowerCase().replace(/\.+$/, "")
  return { valor, cambio: valor !== t.toLowerCase() }
}

/**
 * El teléfono como texto legible. "541143212200.0" (Excel lo leyó como
 * número) vuelve a ser los dígitos. "5.49114321E+12" no tiene arreglo: Excel
 * ya redondeó los últimos dígitos al mostrarlo así, y lo que se recupere es
 * otro número. Se pasa a dígitos igual, pero marcado para revisar.
 */
export function limpiarTelefono(s: string): { valor: string; cambio: boolean; dudoso?: boolean } {
  const t = espacios(s)
  if (!t) return { valor: "", cambio: false }
  if (/^[+-]?\d+(\.\d+)?e[+-]?\d+$/i.test(t)) {
    const n = Number(t)
    if (Number.isFinite(n)) return { valor: BigInt(Math.round(n)).toString(), cambio: true, dudoso: true }
  }
  if (/^\d{8,15}\.0+$/.test(t)) return { valor: t.replace(/\.0+$/, ""), cambio: true }
  return { valor: t, cambio: false }
}

/**
 * "Pérez, Juan" → Juan / Pérez; "Juan Carlos Pérez" → Juan Carlos / Pérez.
 * Con coma es "apellido, nombre"; sin coma, la última palabra es el apellido
 * (con dos palabras no hay forma mejor de adivinar).
 */
export function partirNombre(s: string): { nombre: string; apellido: string } {
  const t = espacios(s)
  if (!t) return { nombre: "", apellido: "" }
  if (t.includes(",")) {
    const [apellido, ...resto] = t.split(",")
    return { nombre: espacios(resto.join(" ")), apellido: espacios(apellido) }
  }
  const partes = t.split(" ")
  if (partes.length === 1) return { nombre: partes[0], apellido: "" }
  return { nombre: partes.slice(0, -1).join(" "), apellido: partes[partes.length - 1] }
}

/* ── La fila ──────────────────────────────────────────────────────────────── */

/**
 * Una fila de la grilla, limpia. `canonico` devuelve cómo se escribe una
 * empresa, vertical o departamento que ya existe ("banco provincia" →
 * "Banco Provincia"), para que no queden dos versiones del mismo valor.
 */
export function leerFila(
  fila: string[],
  mapa: Partial<Record<CampoImportable, number>>,
  canonico: (campo: "empresa" | "vertical" | "departamento", valor: string) => string
): { datos: DatosImportados; arreglos: string[] } {
  const celda = (c: CampoImportable) => {
    const i = mapa[c]
    return i === undefined ? "" : espacios(fila[i] ?? "")
  }
  const arreglos: string[] = []

  let nombre = celda("nombre")
  let apellido = celda("apellido")
  if (!nombre && !apellido && celda("nombreCompleto")) {
    ;({ nombre, apellido } = partirNombre(celda("nombreCompleto")))
    arreglos.push("nombre y apellido separados")
  }
  const n = capitalizar(nombre)
  const a = capitalizar(apellido)
  if (n.cambio || a.cambio) arreglos.push("mayúsculas corregidas")

  const email = limpiarEmail(celda("email"))
  if (email.cambio) arreglos.push("mail limpiado")

  const telefono = limpiarTelefono(celda("telefono"))
  if (telefono.dudoso) arreglos.push("teléfono redondeado por Excel: revisalo")
  else if (telefono.cambio) arreglos.push("teléfono corregido")

  const unificar = (campo: "empresa" | "vertical" | "departamento") => {
    const crudo = celda(campo)
    if (!crudo) return ""
    const valor = canonico(campo, crudo)
    if (valor !== crudo) arreglos.push(`${campo} unificada`)
    return valor
  }

  return {
    datos: {
      am: celda("am"),
      empresa: unificar("empresa"),
      nombre: n.valor,
      apellido: a.valor,
      cargo: celda("cargo"),
      departamento: unificar("departamento"),
      vertical: unificar("vertical"),
      email: email.valor,
      telefono: telefono.valor,
      observaciones: celda("observaciones"),
    },
    arreglos,
  }
}

/**
 * Cómo se reconoce a la misma persona: por mail si tiene; si no, por nombre,
 * apellido y empresa juntos. Sin mail y sin nombre no hay forma segura: `null`.
 */
export function huella(d: { email?: string | null; nombre?: string | null; apellido?: string | null; empresa?: string | null }): string | null {
  if (d.email) return `@${d.email.toLowerCase()}`
  const persona = clave(`${d.nombre ?? ""} ${d.apellido ?? ""}`)
  if (!persona) return null
  return `${persona}|${clave(d.empresa ?? "")}`
}
