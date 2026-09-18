/**
 * Filas de `notas` → lo que consume la pantalla, y el tratamiento de la
 * portada.
 *
 * Solo servidor: importa el cliente con service key y sharp.
 */

import sharp from "sharp"

import { supabase } from "@/lib/supabase"
import {
  LIMITES,
  esCategoria,
  esTipo,
  industriasDe,
  slugDe,
  urlValida,
  type Faq,
  type Fuente,
  type Nota,
} from "@/lib/marketing/notas"

/** Público: la portada de una nota la carga cualquier visitante del sitio. */
export const BUCKET_NOTAS = "notas"

// En una sola línea: supabase-js infiere la forma de la fila de este literal.
export const COLUMNAS_NOTA =
  "id, slug, publicado, destacada, tipo, titulo, titulo_seo, resumen, respuesta, cuerpo, categoria, industrias, tags, faqs, fuentes, autor, autor_cargo, portada_ruta, portada_ancho, portada_alto, publicado_en, revisado_en, autor_nombre, updated_at"

/** La lista del backoffice no necesita el cuerpo entero de cada nota: son 60 kB
 *  por fila que nadie mira hasta abrir la ficha. */
export const COLUMNAS_LISTA =
  "id, slug, publicado, destacada, tipo, titulo, resumen, categoria, industrias, tags, portada_ruta, publicado_en, revisado_en, autor, autor_nombre, updated_at"

type Fila = Record<string, unknown>

export function urlPublica(ruta: string): string {
  return supabase.storage.from(BUCKET_NOTAS).getPublicUrl(ruta).data.publicUrl
}

function texto(v: unknown): string {
  return typeof v === "string" ? v : ""
}

function numeroONull(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : v
  return typeof n === "number" && Number.isFinite(n) ? n : null
}

function listaDeTextos(v: unknown, max: number, largo: number): string[] {
  if (!Array.isArray(v)) return []
  return v
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim().slice(0, largo))
    .filter(Boolean)
    .slice(0, max)
}

/* ── Mapeos ───────────────────────────────────────────────────────────────── */

/**
 * El jsonb de FAQs → una lista válida.
 *
 * Se normaliza campo por campo, como el certificado de los eventos: lo que hay
 * en la columna lo pudo haber escrito una versión anterior del editor, y de acá
 * sale el JSON-LD de FAQPage. Una pregunta sin respuesta no es una FAQ — Google
 * marca el schema como inválido y se pierde el resultado enriquecido de toda la
 * página, no sólo el de esa fila.
 */
export function faqsDe(v: unknown): Faq[] {
  if (!Array.isArray(v)) return []
  return v
    .map((f) => (f && typeof f === "object" ? (f as Record<string, unknown>) : {}))
    .map((f) => ({
      q: texto(f.q).trim().slice(0, LIMITES.faqPregunta),
      a: texto(f.a).trim().slice(0, LIMITES.faqRespuesta),
    }))
    .filter((f) => f.q && f.a)
    .slice(0, LIMITES.faqs)
}

export function fuentesDe(v: unknown): Fuente[] {
  if (!Array.isArray(v)) return []
  return v
    .map((f) => (f && typeof f === "object" ? (f as Record<string, unknown>) : {}))
    .map((f) => ({
      titulo: texto(f.titulo).trim().slice(0, LIMITES.fuenteTitulo),
      url: texto(f.url).trim().slice(0, LIMITES.url),
    }))
    .filter((f) => f.titulo && urlValida(f.url))
    .slice(0, LIMITES.fuentes)
}

export function aNota(fila: Fila): Nota {
  const portada = texto(fila.portada_ruta)
  return {
    id: String(fila.id),
    slug: texto(fila.slug),
    publicado: fila.publicado === true,
    destacada: fila.destacada === true,
    tipo: esTipo(fila.tipo) ? fila.tipo : "nota",
    titulo: texto(fila.titulo),
    tituloSeo: texto(fila.titulo_seo),
    resumen: texto(fila.resumen),
    respuesta: texto(fila.respuesta),
    cuerpo: texto(fila.cuerpo),
    categoria: esCategoria(fila.categoria) ? fila.categoria : null,
    industrias: industriasDe(fila.industrias),
    tags: Array.isArray(fila.tags) ? fila.tags.map(String) : [],
    faqs: faqsDe(fila.faqs),
    fuentes: fuentesDe(fila.fuentes),
    autor: texto(fila.autor),
    autorCargo: texto(fila.autor_cargo),
    portadaUrl: portada ? urlPublica(portada) : null,
    portadaAncho: numeroONull(fila.portada_ancho),
    portadaAlto: numeroONull(fila.portada_alto),
    publicadoEn: texto(fila.publicado_en),
    revisadoEn: texto(fila.revisado_en),
    autorNombre: texto(fila.autor_nombre),
    actualizado: texto(fila.updated_at),
  }
}

/* ── El cuerpo del editor ─────────────────────────────────────────────────── */

/**
 * El JSON del editor → las columnas de `notas`, menos la portada y el slug.
 *
 * Mismo criterio que eventos y popups: el formulario manda la ficha entera y
 * esto la reemplaza. El alta y la edición comparten esta función para que no
 * pueda pasar que una acepte un resumen de 300 y la otra de 500.
 */
export function filaDelCuerpo(b: Record<string, unknown>): Record<string, unknown> {
  const opcional = (v: unknown, max: number) => texto(v).trim().slice(0, max) || null
  const fecha = (v: unknown) => {
    const s = texto(v)
    if (!s) return null
    const d = new Date(s)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  }

  const tags = [...new Set(listaDeTextos(b.tags, LIMITES.tags, LIMITES.tag).map((t) => t.replace(/^#/, "")))]

  return {
    publicado: b.publicado === true,
    destacada: b.destacada === true,
    tipo: esTipo(b.tipo) ? b.tipo : "nota",
    titulo: texto(b.titulo).trim().slice(0, LIMITES.titulo),
    titulo_seo: opcional(b.tituloSeo, LIMITES.tituloSeo),
    resumen: opcional(b.resumen, LIMITES.resumen),
    respuesta: opcional(b.respuesta, LIMITES.respuesta),
    // El cuerpo NO se recorta con trim de los renglones: los saltos de línea son
    // markdown. Sólo se topea el largo.
    cuerpo: texto(b.cuerpo).slice(0, LIMITES.cuerpo),
    categoria: esCategoria(b.categoria) ? b.categoria : null,
    industrias: industriasDe(b.industrias),
    tags,
    faqs: faqsDe(b.faqs),
    fuentes: fuentesDe(b.fuentes),
    autor: opcional(b.autor, LIMITES.autor),
    autor_cargo: opcional(b.autorCargo, LIMITES.autorCargo),
    publicado_en: fecha(b.publicadoEn),
    revisado_en: fecha(b.revisadoEn),
  }
}

export function problemaDeLaFila(fila: Record<string, unknown>): string | null {
  if (!fila.titulo) return "Falta el título"
  if (!texto(fila.cuerpo).trim()) return "Falta el cuerpo de la nota"
  if (fila.publicado === true && !fila.resumen) return "Para publicar hace falta el resumen: es lo que muestra Google"
  return null
}

/**
 * La fecha de publicación que corresponde guardar.
 *
 * Si la nota se publica y nadie eligió fecha, es ahora. Y una vez puesta no se
 * vuelve a tocar sola: despublicar y volver a publicar una nota de marzo no
 * puede convertirla en una nota de hoy, porque para Google eso es contenido
 * nuevo que en realidad no lo es.
 */
export function publicadoEnDe(fila: Record<string, unknown>, actual: string | null): string | null {
  if (fila.publicado_en) return fila.publicado_en as string
  if (actual) return actual
  return fila.publicado === true ? new Date().toISOString() : null
}

/**
 * Un slug libre a partir del título: "firma-biometrica-validez-legal", y si ya
 * existe, "-2", "-3"… Se resuelve contra la base y no con un sufijo aleatorio
 * para que la dirección se pueda leer y dictar.
 */
export async function slugLibre(titulo: string, excepto?: string): Promise<string> {
  const base = slugDe(titulo) || "nota"
  const { data } = await supabase.from("notas").select("id, slug").like("slug", `${base}%`)
  const tomados = new Set((data ?? []).filter((f) => f.id !== excepto).map((f) => String(f.slug)))
  if (!tomados.has(base)) return base
  for (let i = 2; i < 500; i++) {
    const candidato = `${base.slice(0, 85)}-${i}`
    if (!tomados.has(candidato)) return candidato
  }
  return `${base.slice(0, 80)}-${Date.now().toString(36)}`
}

/* ── Portada ──────────────────────────────────────────────────────────────── */

export const IMAGEN_TAMANO_MAX = 8 * 1024 * 1024

export function problemaDeImagen(archivo: File): string | null {
  const extensionOk = /\.(jpe?g|png|webp|avif)$/i.test(archivo.name)
  const tipoOk = /^image\/(jpeg|png|webp|avif)$/.test(archivo.type)
  if (!tipoOk && !extensionOk) return "La imagen tiene que ser PNG, JPG, WebP o AVIF"
  if (archivo.size > IMAGEN_TAMANO_MAX) return "La imagen no puede pesar más de 8 MB"
  return null
}

/**
 * La portada de la nota: WebP a 1600 px como mucho, con la orientación EXIF
 * aplicada. Mismo tratamiento que la portada de un evento.
 *
 * 1600 px no es un número redondo cualquiera: es lo que pide la tarjeta de
 * LinkedIn y WhatsApp cuando alguien comparte la nota (1200×630 recortado), que
 * en la práctica es de dónde va a venir buena parte del tráfico los primeros
 * meses.
 */
export async function subirPortada(
  archivo: File
): Promise<{ ruta: string; ancho: number; alto: number } | { error: string }> {
  try {
    const entrada = Buffer.from(await archivo.arrayBuffer())
    const salida = await sharp(entrada)
      .rotate()
      .resize({ width: 1600, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true })

    if (salida.info.width < 600) {
      return { error: `La portada es chica: tiene ${salida.info.width} px de ancho y hacen falta al menos 600.` }
    }

    const ruta = `portadas/${crypto.randomUUID()}.webp`
    const { error } = await supabase.storage
      .from(BUCKET_NOTAS)
      .upload(ruta, salida.data, { contentType: "image/webp", upsert: false })
    if (error) {
      console.error("[notas portada upload]", error)
      return { error: "No se pudo subir la portada" }
    }
    return { ruta, ancho: salida.info.width, alto: salida.info.height }
  } catch (e) {
    console.error("[notas portada sharp]", e)
    return { error: "No se pudo procesar la portada. ¿Es un archivo válido?" }
  }
}

export async function borrarObjetos(rutas: (string | null | undefined)[]): Promise<void> {
  const limpias = rutas.filter((r): r is string => typeof r === "string" && r.length > 0)
  if (limpias.length === 0) return
  const { error } = await supabase.storage.from(BUCKET_NOTAS).remove(limpias)
  if (error) console.error("[notas remove]", error)
}

/* ── Lecturas ─────────────────────────────────────────────────────────────── */

/** La lista del backoffice: todas, de la más nueva a la más vieja. Sin cuerpo. */
export async function leerNotas(): Promise<Nota[]> {
  const { data, error } = await supabase
    .from("notas")
    .select(COLUMNAS_LISTA)
    .order("publicado_en", { ascending: false, nullsFirst: true })
    .order("updated_at", { ascending: false })

  if (error) {
    console.error("[notas leer]", error)
    return []
  }
  return (data ?? []).map((f) => aNota(f as Fila))
}

export async function leerNota(id: string): Promise<Nota | null> {
  const { data } = await supabase.from("notas").select(COLUMNAS_NOTA).eq("id", id).maybeSingle()
  return data ? aNota(data as Fila) : null
}
