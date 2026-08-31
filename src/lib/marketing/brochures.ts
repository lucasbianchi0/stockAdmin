/**
 * Brochures — tipos, catálogo y las reglas del archivo.
 *
 * Un brochure son tres cosas: una categoría, un título y el PDF. Nada más.
 *
 * Hubo una versión con industria, descripción, "cuándo usar" y etiquetas. Se
 * sacó: cargar un material pasaba por seis campos de texto que casi siempre
 * quedaban vacíos o repetían el título, y la pantalla mostraba tanto alrededor
 * del PDF que costaba encontrar el PDF. Lo que se viene a hacer acá es agarrar
 * el archivo y mandarlo — todo lo que no ayude a eso estorba.
 *
 * Sin imports de servidor a propósito: lo usan el formulario, la lista y los
 * handlers de API. Teniendo las reglas acá, las dos puntas validan igual porque
 * validan con la misma función — si el límite de tamaño viviera solo en el
 * cliente, el endpoint aceptaría el PDF de 80 MB que el navegador rechazó.
 */

import { formatearTamano } from "@/lib/marketing/formato"

export { formatearTamano }

/* ── Categoría ────────────────────────────────────────────────────────────── */

/**
 * Las cinco soluciones de Accedra más dos casilleros de servicio.
 *
 * Los slugs son los mismos que `SERVICIOS` en lib/brand-kit.ts, y eso no es una
 * coincidencia que haya que mantener a mano: es el eje con el que ya están
 * armadas las campañas, las landings y los informes. El material que se manda
 * por mail tiene que clasificarse igual que el que está publicado, o "qué
 * tenemos de firma biométrica" se contesta distinto según dónde se mire.
 *
 * El orden es el del sitio, no el alfabético.
 */
export const SOLUCIONES = [
  "networking",
  "firma-biometrica",
  "consultoria",
  "seguridad",
  "software-ai",
  "institucional",
  "otra",
] as const

export type Solucion = (typeof SOLUCIONES)[number]

export const SOLUCION_LABEL: Record<Solucion, string> = {
  networking: "Networking",
  "firma-biometrica": "Firma Biométrica",
  consultoria: "Consultoría Microsoft",
  seguridad: "Seguridad IT",
  "software-ai": "Software & AI",
  institucional: "Institucional",
  otra: "Otra",
}

/** La frase que aparece al elegir. Sin esto, "Institucional" y "Otra" se pisan
 *  y cada uno clasifica como le parece. */
export const SOLUCION_PISTA: Record<Solucion, string> = {
  networking: "Infraestructura de red, del cableado a la nube",
  "firma-biometrica": "Firma electrónica y biométrica con validez legal",
  consultoria: "Ecosistema Microsoft, Power BI y gestión documental",
  seguridad: "Ciberseguridad, firewalls y Zero Trust",
  "software-ai": "Desarrollo a medida, integraciones e IA aplicada",
  institucional: "La empresa entera: quiénes somos, casos, partners",
  otra: "No entra en ninguna de las anteriores",
}

export function esSolucion(v: unknown): v is Solucion {
  return typeof v === "string" && (SOLUCIONES as readonly string[]).includes(v)
}

/* ── El brochure ──────────────────────────────────────────────────────────── */

export type Brochure = {
  id: string
  titulo: string
  solucion: Solucion

  archivoNombre: string
  archivoTamano: number | null
  /**
   * URL firmada, con vencimiento. No se guarda en la base: vence, y guardar algo
   * que deja de servir es peor que no guardarlo. Se pide cada vez que se lista.
   */
  url: string | null
}

/* ── Límites ──────────────────────────────────────────────────────────────── */

export const LIMITES = {
  titulo: 120,
  nombreArchivo: 200,
} as const

/* ── El archivo ───────────────────────────────────────────────────────────── */

/**
 * Solo PDF, y es deliberado.
 *
 * Un brochure es material terminado que se reenvía tal cual al cliente: si se
 * aceptaran .pptx o .docx, lo que llega afuera sería un archivo editable, con
 * comentarios adentro y con la tipografía rota en la máquina del que lo abre.
 * El PDF es la forma en que el material efectivamente se manda; el resto es la
 * fuente, y la fuente vive en el Drive.
 */
export const TIPO_ARCHIVO = "application/pdf"

/** 25 MB. Un brochure con fotos de buena calidad ronda los 8 MB; el techo está
 *  para frenar el PDF sin comprimir que después nadie puede mandar por mail. */
export const TAMANO_MAX = 25 * 1024 * 1024

/** El navegador miente con el MIME más seguido de lo que parece —sobre todo en
 *  Windows—, así que la extensión vale como segunda oportunidad. */
function esPdf(archivo: { type: string; name: string }): boolean {
  return archivo.type === TIPO_ARCHIVO || archivo.name.toLowerCase().endsWith(".pdf")
}

/** El motivo por el que este archivo no sirve, o `null` si sirve. Una sola
 *  función para el input, el submit y el endpoint. */
export function problemaDelArchivo(archivo: {
  type: string
  name: string
  size: number
}): string | null {
  if (!archivo.size) return "El archivo está vacío."
  if (!esPdf(archivo)) return "Solo se aceptan PDF. Exportá el material a PDF y volvé a subirlo."
  if (archivo.size > TAMANO_MAX) {
    return `El PDF pesa ${formatearTamano(archivo.size)} y el máximo son 25 MB. Comprimilo antes de subirlo.`
  }
  return null
}

/* ── El formulario ────────────────────────────────────────────────────────── */

export type BorradorBrochure = {
  titulo: string
  solucion: Solucion
}

export const BORRADOR_VACIO: BorradorBrochure = {
  titulo: "",
  solucion: "institucional",
}

/**
 * Qué le falta al borrador para poder guardarse. Vacío = está listo.
 *
 * En el alta el PDF es obligatorio —un brochure sin archivo no es nada—, pero en
 * la edición no: cambiarle el título al material que ya está subido tiene que
 * poder hacerse sin volver a elegir el mismo PDF.
 */
export function faltantesDe(b: BorradorBrochure, hayArchivo: boolean): string[] {
  const faltan: string[] = []
  if (!b.titulo.trim()) faltan.push("un título")
  if (!hayArchivo) faltan.push("el PDF")
  return faltan
}

/* ── Presentación ─────────────────────────────────────────────────────────── */

/**
 * La URL firmada, pero forzando la descarga con el nombre real del archivo.
 *
 * El atributo `download` de un `<a>` no sirve acá: los navegadores lo ignoran
 * cuando el archivo es de otro origen, y el bucket de Storage lo es. Sin esto,
 * "Descargar" abre el PDF en una pestaña y, si alguien lo guarda desde ahí, el
 * archivo llega al disco con el uuid de la ruta como nombre.
 *
 * `?download=` es lo que Supabase entiende para responder con
 * `Content-Disposition: attachment`, que es la única forma de que el nombre lo
 * decida la aplicación y no la clave del objeto.
 */
export function urlDeDescarga(b: Brochure): string | null {
  if (!b.url) return null
  try {
    const u = new URL(b.url)
    u.searchParams.set("download", b.archivoNombre)
    return u.toString()
  } catch {
    return b.url
  }
}
