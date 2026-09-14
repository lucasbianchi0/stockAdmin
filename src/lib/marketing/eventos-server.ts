/**
 * Filas de `eventos`, `evento_asistentes` y `marcas` → lo que consume la
 * pantalla, y el tratamiento de las imágenes.
 *
 * Solo servidor: importa el cliente con service key y sharp.
 */

import sharp from "sharp"

import { supabase } from "@/lib/supabase"
import {
  CERTIFICADO_VACIO,
  HORAS_MAX,
  LIMITES,
  categoriasDe,
  esModalidad,
  esTema,
  esTipo,
  slugDe,
  urlValida,
  type Asistente,
  type Certificado,
  type Evento,
  type Marca,
  type Orador,
} from "@/lib/marketing/eventos"

/** Público: portadas y logos los carga cualquier visitante del sitio. */
export const BUCKET_EVENTOS = "eventos"

// En una sola línea: supabase-js infiere la forma de la fila de este literal.
export const COLUMNAS_EVENTO =
  "id, slug, publicado, destacado, tipo, modalidad, titulo, resumen, descripcion, tags, categorias, inicio, fin, lugar, inscripcion_url, cupo, precio, oradores, marca_ids, portada_ruta, portada_ancho, portada_alto, certificado, updated_at"

export const COLUMNAS_ASISTENTE = "id, evento_id, nombre, email, empresa, horas, codigo, created_at"

export const COLUMNAS_MARCA = "id, nombre, logo_ruta, logo_ancho, logo_alto"

type Fila = Record<string, unknown>

export function urlPublica(ruta: string): string {
  return supabase.storage.from(BUCKET_EVENTOS).getPublicUrl(ruta).data.publicUrl
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
 * El JSON del certificado → un certificado completo.
 *
 * Normaliza campo por campo en vez de confiar en la forma: la columna es un
 * jsonb y lo que haya adentro lo pudo haber escrito una versión anterior del
 * editor. Lo que falta toma el valor por defecto, lo que sobra se descarta, lo
 * que es demasiado largo se corta. Se usa al leer Y al escribir, así que en la
 * base no entra nada que la pieza no pueda dibujar.
 */
export function certificadoDe(v: unknown): Certificado {
  const c = (v && typeof v === "object" ? v : {}) as Record<string, unknown>
  const d = CERTIFICADO_VACIO

  const firmantes = Array.isArray(c.firmantes)
    ? c.firmantes
        .map((f) => (f && typeof f === "object" ? (f as Record<string, unknown>) : {}))
        .map((f) => {
          // Sólo rutas con la forma que genera `subirFirma()`: un JSON editado a
          // mano no puede apuntar a otro objeto del bucket, y menos hacer que se
          // borre al guardar.
          const ruta = texto(f.firmaRuta)
          const firmaRuta = RUTA_FIRMA.test(ruta) ? ruta : ""
          return {
            nombre: texto(f.nombre).trim().slice(0, LIMITES.firmanteCampo),
            cargo: texto(f.cargo).trim().slice(0, LIMITES.firmanteCampo),
            firmaRuta,
            firmaUrl: firmaRuta ? urlPublica(firmaRuta) : "",
          }
        })
        .filter((f) => f.nombre || f.cargo || f.firmaRuta)
        .slice(0, LIMITES.firmantes)
    : d.firmantes

  const horas = numeroONull(c.horas)

  return {
    tema: esTema(c.tema) ? c.tema : d.tema,
    titulo: typeof c.titulo === "string" ? c.titulo.slice(0, LIMITES.certTitulo) : d.titulo,
    tituloCurso: texto(c.tituloCurso).slice(0, LIMITES.certCurso),
    horas: horas !== null && horas > 0 ? Math.min(HORAS_MAX, Math.round(horas * 10) / 10) : d.horas,
    fechaTexto: texto(c.fechaTexto).slice(0, LIMITES.certFecha),
    contenidos: listaDeTextos(c.contenidos, LIMITES.contenidos, LIMITES.contenido),
    // Un certificado guardado antes de existir la bandera con logos elegidos ya
    // eran propios: se respeta. Sin logos, heredaba del evento.
    marcasPropias:
      c.marcasPropias === true || (c.marcasPropias === undefined && Array.isArray(c.marcaIds) && c.marcaIds.length > 0),
    marcaIds: listaDeTextos(c.marcaIds, LIMITES.marcas, 36),
    firmantes,
    // Apagados salvo que se prendan a propósito: el certificado se piensa para
    // compartirse en LinkedIn, y ahí la lista de temas es texto que no se lee.
    mostrarContenidos: c.mostrarContenidos === true,
    mostrarTecnologias: c.mostrarTecnologias !== false,
    mostrarCodigo: c.mostrarCodigo !== false,
  }
}

/** Las imágenes de firma que usa un certificado. */
export function rutasDeFirmas(c: Certificado): string[] {
  return c.firmantes.map((f) => f.firmaRuta).filter(Boolean)
}

/** El certificado como se guarda: sin las URL, que se arman al leer. */
function paraGuardar(c: Certificado) {
  return { ...c, firmantes: c.firmantes.map((f) => ({ nombre: f.nombre, cargo: f.cargo, firmaRuta: f.firmaRuta })) }
}

export function oradoresDe(v: unknown): Orador[] {
  if (!Array.isArray(v)) return []
  return v
    .map((o) => (o && typeof o === "object" ? (o as Record<string, unknown>) : {}))
    .map((o) => ({
      nombre: texto(o.nombre).trim().slice(0, LIMITES.oradorCampo),
      cargo: texto(o.cargo).trim().slice(0, LIMITES.oradorCampo),
      empresa: texto(o.empresa).trim().slice(0, LIMITES.oradorCampo),
    }))
    .filter((o) => o.nombre)
    .slice(0, LIMITES.oradores)
}

export function aEvento(fila: Fila, asistentes = 0): Evento {
  const portada = texto(fila.portada_ruta)
  return {
    id: String(fila.id),
    slug: texto(fila.slug),
    publicado: fila.publicado === true,
    destacado: fila.destacado === true,
    tipo: esTipo(fila.tipo) ? fila.tipo : "workshop",
    modalidad: esModalidad(fila.modalidad) ? fila.modalidad : "presencial",
    titulo: texto(fila.titulo),
    resumen: texto(fila.resumen),
    descripcion: texto(fila.descripcion),
    tags: Array.isArray(fila.tags) ? fila.tags.map(String) : [],
    categorias: categoriasDe(fila.categorias),
    inicio: texto(fila.inicio),
    fin: texto(fila.fin),
    lugar: texto(fila.lugar),
    inscripcionUrl: texto(fila.inscripcion_url),
    cupo: numeroONull(fila.cupo),
    precio: texto(fila.precio),
    oradores: oradoresDe(fila.oradores),
    marcaIds: Array.isArray(fila.marca_ids) ? fila.marca_ids.map(String) : [],
    portadaUrl: portada ? urlPublica(portada) : null,
    portadaAncho: numeroONull(fila.portada_ancho),
    portadaAlto: numeroONull(fila.portada_alto),
    certificado: certificadoDe(fila.certificado),
    asistentes,
    actualizado: texto(fila.updated_at),
  }
}

export function aAsistente(fila: Fila): Asistente {
  return {
    id: String(fila.id),
    eventoId: String(fila.evento_id),
    nombre: texto(fila.nombre),
    email: texto(fila.email),
    empresa: texto(fila.empresa),
    horas: numeroONull(fila.horas),
    codigo: texto(fila.codigo),
    creado: texto(fila.created_at),
  }
}

export function aMarca(fila: Fila): Marca {
  return {
    id: String(fila.id),
    nombre: texto(fila.nombre),
    logoUrl: urlPublica(texto(fila.logo_ruta)),
    logoAncho: numeroONull(fila.logo_ancho),
    logoAlto: numeroONull(fila.logo_alto),
  }
}

/* ── El cuerpo del editor ─────────────────────────────────────────────────── */

/**
 * El JSON del editor → las columnas de `eventos`, menos la portada y el slug.
 *
 * Mismo criterio que popups: el formulario manda la ficha entera y esto la
 * reemplaza. El alta y la edición comparten esta función para que no pueda
 * pasar que una acepte un título de 90 y la otra de 120.
 */
export function filaDelCuerpo(b: Record<string, unknown>): Record<string, unknown> {
  const opcional = (v: unknown, max: number) => texto(v).trim().slice(0, max) || null
  const fecha = (v: unknown) => {
    const s = texto(v)
    if (!s) return null
    const d = new Date(s)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  }
  const cupo = numeroONull(b.cupo)

  const tags = [
    ...new Set(listaDeTextos(b.tags, LIMITES.tags, LIMITES.tag).map((t) => t.replace(/^#/, ""))),
  ]

  return {
    publicado: b.publicado === true,
    destacado: b.destacado === true,
    tipo: esTipo(b.tipo) ? b.tipo : "workshop",
    modalidad: esModalidad(b.modalidad) ? b.modalidad : "presencial",
    titulo: texto(b.titulo).trim().slice(0, LIMITES.titulo),
    resumen: opcional(b.resumen, LIMITES.resumen),
    descripcion: opcional(b.descripcion, LIMITES.descripcion),
    tags,
    categorias: categoriasDe(b.categorias),
    inicio: fecha(b.inicio),
    fin: fecha(b.fin),
    lugar: opcional(b.lugar, LIMITES.lugar),
    inscripcion_url: opcional(b.inscripcionUrl, LIMITES.url),
    cupo: cupo !== null && cupo > 0 ? Math.round(cupo) : null,
    precio: opcional(b.precio, LIMITES.precio),
    oradores: oradoresDe(b.oradores),
    marca_ids: listaDeTextos(b.marcaIds, LIMITES.marcas, 36),
    certificado: paraGuardar(certificadoDe(b.certificado)),
  }
}

export function problemaDeLaFila(fila: Record<string, unknown>): string | null {
  if (!fila.titulo) return "Falta el título"
  if (!fila.inicio) return "Falta la fecha de inicio"
  const inicio = fila.inicio as string
  const fin = fila.fin as string | null
  if (fin && new Date(fin) <= new Date(inicio)) return "La hora de fin tiene que ser posterior a la de inicio"
  const url = fila.inscripcion_url as string | null
  if (url && !urlValida(url)) return "El link de inscripción tiene que empezar con https://"
  return null
}

/**
 * Un slug libre a partir del título: "copilot-para-ventas", y si ya existe,
 * "copilot-para-ventas-2", "-3"… Se resuelve contra la base y no con un sufijo
 * aleatorio para que la dirección se pueda dictar por teléfono.
 */
export async function slugLibre(titulo: string, excepto?: string): Promise<string> {
  const base = slugDe(titulo) || "evento"
  const { data } = await supabase.from("eventos").select("id, slug").like("slug", `${base}%`)
  const tomados = new Set((data ?? []).filter((f) => f.id !== excepto).map((f) => String(f.slug)))
  if (!tomados.has(base)) return base
  for (let i = 2; i < 500; i++) {
    const candidato = `${base.slice(0, 75)}-${i}`
    if (!tomados.has(candidato)) return candidato
  }
  return `${base.slice(0, 70)}-${Date.now().toString(36)}`
}

/* ── Códigos de certificado ───────────────────────────────────────────────── */

/** Sin 0/O ni 1/I/L: el código se tipea mirando un papel. */
const ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"

/** "ACC-26-7K3QXM". Seis caracteres de 31 son 887 millones de combinaciones:
 *  nadie adivina uno ajeno y la colisión la ataja el `unique` de la tabla. */
export function codigoNuevo(fechaEvento: string): string {
  const anio = String(new Date(fechaEvento || Date.now()).getFullYear()).slice(-2)
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  const cuerpo = Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join("")
  return `ACC-${anio}-${cuerpo}`
}

/* ── Imágenes ─────────────────────────────────────────────────────────────── */

export const IMAGEN_TAMANO_MAX = 8 * 1024 * 1024

export function problemaDeImagen(archivo: File): string | null {
  const extensionOk = /\.(jpe?g|png|webp|avif|svg)$/i.test(archivo.name)
  const tipoOk = /^image\/(jpeg|png|webp|avif|svg\+xml)$/.test(archivo.type)
  if (!tipoOk && !extensionOk) return "La imagen tiene que ser PNG, JPG, WebP, AVIF o SVG"
  if (archivo.size > IMAGEN_TAMANO_MAX) return "La imagen no puede pesar más de 8 MB"
  return null
}

/**
 * La portada del evento: WebP a 1600 px como mucho, con la orientación EXIF
 * aplicada. Mismo tratamiento que la imagen del popup —ver popups-server.ts—.
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
      .from(BUCKET_EVENTOS)
      .upload(ruta, salida.data, { contentType: "image/webp", upsert: false })
    if (error) {
      console.error("[eventos portada upload]", error)
      return { error: "No se pudo subir la portada" }
    }
    return { ruta, ancho: salida.info.width, alto: salida.info.height }
  } catch (e) {
    console.error("[eventos portada sharp]", e)
    return { error: "No se pudo procesar la portada. ¿Es un archivo válido?" }
  }
}

/**
 * El logo de una marca.
 *
 * Tres cosas que hacen que seis logos de seis fuentes distintas se vean como
 * una fila y no como un collage:
 *
 *  · `trim()` recorta el margen transparente (o blanco) que trae el PNG. Un logo
 *    bajado de la web de Microsoft tiene 40% de aire alrededor y otro de Cisco
 *    viene pegado al borde: sin recortar, uno se ve la mitad de grande que el
 *    otro con la misma altura de caja.
 *  · Se normaliza a 320 px de alto. Lo más grande que se dibuja es la placa del
 *    certificado impreso, unos 48 px a 300 dpi; más es peso sin ganancia.
 *  · Sale PNG y no WebP: conserva la transparencia en cualquier visor de PDF y
 *    en el cliente de mail que algún día lo reciba.
 *
 * El SVG se rasteriza con densidad alta antes de recortar, para que no quede
 * pixelado.
 */
export async function subirLogo(
  archivo: File
): Promise<{ ruta: string; ancho: number; alto: number } | { error: string }> {
  try {
    const entrada = Buffer.from(await archivo.arrayBuffer())
    const esSvg = /svg/i.test(archivo.type) || /\.svg$/i.test(archivo.name)
    const base = sharp(entrada, esSvg ? { density: 600 } : undefined)

    const recortado = await base.rotate().trim({ threshold: 12 }).toBuffer()
    const salida = await sharp(recortado)
      .resize({ height: 320, width: 1400, fit: "inside", withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toBuffer({ resolveWithObject: true })

    const ruta = `marcas/${crypto.randomUUID()}.png`
    const { error } = await supabase.storage
      .from(BUCKET_EVENTOS)
      .upload(ruta, salida.data, { contentType: "image/png", upsert: false })
    if (error) {
      console.error("[marcas upload]", error)
      return { error: "No se pudo subir el logo" }
    }
    return { ruta, ancho: salida.info.width, alto: salida.info.height }
  } catch (e) {
    console.error("[marcas sharp]", e)
    return { error: "No se pudo procesar el logo. ¿Es un PNG o SVG válido?" }
  }
}

export async function borrarObjetos(rutas: (string | null | undefined)[]): Promise<void> {
  const limpias = rutas.filter((r): r is string => typeof r === "string" && r.length > 0)
  if (limpias.length === 0) return
  const { error } = await supabase.storage.from(BUCKET_EVENTOS).remove(limpias)
  if (error) console.error("[eventos remove]", error)
}

/* ── Firmas ───────────────────────────────────────────────────────────────── */

const RUTA_FIRMA = /^firmas\/[0-9a-f-]{36}\.png$/

/**
 * La imagen de una firma, lista para ir sobre el fondo oscuro del certificado.
 *
 * Lo que llega casi siempre es una foto o un escaneo: tinta oscura sobre papel
 * blanco. Tal cual, sobre el azul sería un rectángulo blanco con un garabato
 * adentro. Así que se convierte:
 *
 *  · el fondo (blanco, o transparente si ya era un PNG) se aplana a blanco;
 *  · la luminancia pasa a ser la transparencia: donde hay tinta, opaco; donde
 *    hay papel, transparente. Con un umbral para que la textura del papel y
 *    las sombras de la foto no queden como una neblina gris;
 *  · el trazo sale en blanco puro, y se recorta al borde de la tinta.
 *
 * El resultado es un PNG con la firma en blanco que se apoya directo sobre el
 * certificado, sin filtros de CSS que después no imprimen igual.
 */
export async function subirFirma(archivo: File): Promise<{ ruta: string; url: string } | { error: string }> {
  let png: Buffer
  try {
    const entrada = Buffer.from(await archivo.arrayBuffer())
    const esSvg = /svg/i.test(archivo.type) || /\.svg$/i.test(archivo.name)

    const { data, info } = await sharp(entrada, esSvg ? { density: 300 } : undefined)
      .rotate()
      .flatten({ background: "#ffffff" })
      .resize({ width: 1200, height: 400, fit: "inside", withoutEnlargement: true })
      .greyscale()
      .normalise()
      .raw()
      .toBuffer({ resolveWithObject: true })

    const pixeles = info.width * info.height
    const rgba = Buffer.alloc(pixeles * 4)
    let conTinta = 0
    for (let i = 0; i < pixeles; i++) {
      const tinta = 255 - data[i * info.channels]
      const alfa = tinta < 60 ? 0 : Math.min(255, Math.round((tinta - 60) * 1.6))
      if (alfa > 0) conTinta++
      rgba[i * 4] = 255
      rgba[i * 4 + 1] = 255
      rgba[i * 4 + 2] = 255
      rgba[i * 4 + 3] = alfa
    }

    if (conTinta < 50) return { error: "No se encontró una firma en la imagen. ¿Es tinta oscura sobre fondo claro?" }

    png = await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
      .trim()
      .png({ compressionLevel: 9 })
      .toBuffer()
  } catch (e) {
    console.error("[firmas sharp]", e)
    return { error: "No se pudo procesar la imagen de la firma. ¿Es un archivo válido?" }
  }

  const ruta = `firmas/${crypto.randomUUID()}.png`
  const { error } = await supabase.storage.from(BUCKET_EVENTOS).upload(ruta, png, { contentType: "image/png", upsert: false })
  if (error) {
    console.error("[firmas upload]", error)
    return { error: "No se pudo subir la firma" }
  }
  return { ruta, url: urlPublica(ruta) }
}

/* ── Lecturas compartidas ─────────────────────────────────────────────────── */

/** Todas las marcas, por nombre. La biblioteca entera viaja con el editor: son
 *  decenas de filas, y el selector filtra sin volver al servidor. */
export async function leerMarcas(): Promise<Marca[]> {
  const { data, error } = await supabase.from("marcas").select(COLUMNAS_MARCA).order("nombre")
  if (error) {
    console.error("[marcas leer]", error)
    return []
  }
  return (data ?? []).map(aMarca)
}

/** Un evento con sus asistentes. Lo usan el editor y la vista de impresión. */
export async function leerEventoCompleto(
  id: string
): Promise<{ evento: Evento; asistentes: Asistente[] } | null> {
  const { data: fila } = await supabase.from("eventos").select(COLUMNAS_EVENTO).eq("id", id).maybeSingle()
  if (!fila) return null

  const { data: filas } = await supabase
    .from("evento_asistentes")
    .select(COLUMNAS_ASISTENTE)
    .eq("evento_id", id)
    .order("nombre")

  const asistentes = (filas ?? []).map(aAsistente)
  return { evento: aEvento(fila, asistentes.length), asistentes }
}
