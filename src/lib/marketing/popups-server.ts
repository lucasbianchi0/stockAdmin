/**
 * Fila de `popups` → lo que consume la pantalla, y la normalización de la imagen.
 *
 * Solo servidor: importa el cliente con service key y sharp.
 *
 * Vive aparte del archivo de reglas porque lo comparten las tres rutas (lista,
 * alta, edición) y el día que una devuelva `imagen_ruta` y otra `imagenUrl` la
 * vista previa se dibuja sin imagen y sin un solo error en la consola.
 */

import sharp from "sharp"

import { supabase } from "@/lib/supabase"
import {
  IMAGEN_ANCHO_MIN,
  LIMITES,
  esAccion,
  esAlcance,
  esFormato,
  esFrecuencia,
  urlValida,
  type Popup,
} from "@/lib/marketing/popups"

/** Público: la imagen la carga cualquier visitante anónimo del sitio. Ver el
 *  comentario de la migración. */
export const BUCKET_POPUP = "popup"

/**
 * Explícitas y no `*`: dejar el asterisco significa que cualquier columna que
 * se agregue mañana viaja sola en cada request sin que nadie lo decida.
 */
// En una sola línea y sin concatenar: el tipado de supabase-js lee esta cadena
// como literal para inferir la forma de la fila, y un `"a" + "b"` la degrada a
// `string`.
export const COLUMNAS_POPUP =
  "id, nombre, activo, formato, etiqueta, titulo, descripcion, imagen_ruta, imagen_ancho, imagen_alto, imagen_alt, accion, cta_texto, cta_url, cta_nueva_pestana, mail_gracias, cerrar_texto, desde, hasta, demora_s, frecuencia, alcance, rutas, updated_at"

type Fila = Record<string, unknown>

/** La URL pública de un objeto del bucket. No se guarda en la base: se arma con
 *  el host del proyecto, y guardarla armada dejaría URLs muertas el día que el
 *  proyecto cambie de host. */
export function urlPublica(ruta: string): string {
  return supabase.storage.from(BUCKET_POPUP).getPublicUrl(ruta).data.publicUrl
}

function texto(v: unknown): string {
  return typeof v === "string" ? v : ""
}

/** Fila → popup. Los fallbacks cubren el hueco entre desplegar una migración que
 *  agrega un valor y desplegar el código que lo conoce: ahí es donde la pantalla
 *  se rompería. */
export function aPopup(fila: Fila): Popup {
  const ruta = texto(fila.imagen_ruta)

  return {
    id: String(fila.id),
    nombre: texto(fila.nombre),
    activo: fila.activo === true,

    formato: esFormato(fila.formato) ? fila.formato : "modal",

    etiqueta: texto(fila.etiqueta),
    titulo: texto(fila.titulo),
    descripcion: texto(fila.descripcion),

    imagenUrl: ruta ? urlPublica(ruta) : null,
    imagenAncho: typeof fila.imagen_ancho === "number" ? fila.imagen_ancho : null,
    imagenAlto: typeof fila.imagen_alto === "number" ? fila.imagen_alto : null,
    imagenAlt: texto(fila.imagen_alt),

    accion: esAccion(fila.accion) ? fila.accion : "mail",
    ctaTexto: texto(fila.cta_texto),
    ctaUrl: texto(fila.cta_url),
    ctaNuevaPestana: fila.cta_nueva_pestana !== false,
    mailGracias: texto(fila.mail_gracias),
    cerrarTexto: texto(fila.cerrar_texto),

    desde: texto(fila.desde),
    hasta: texto(fila.hasta),
    demoraS: typeof fila.demora_s === "number" ? fila.demora_s : 6,
    frecuencia: esFrecuencia(fila.frecuencia) ? fila.frecuencia : "sesion",
    alcance: esAlcance(fila.alcance) ? fila.alcance : "todas",
    rutas: Array.isArray(fila.rutas) ? fila.rutas.map(String) : [],

    actualizado: texto(fila.updated_at),
  }
}

/** La ruta del objeto en el bucket, que nunca sale hacia el cliente: es la
 *  dirección real del archivo y es lo que hay que borrar al reemplazarlo. */
export function rutaDeFila(fila: Fila): string {
  return texto(fila.imagen_ruta)
}

/* ── La imagen ────────────────────────────────────────────────────────────── */

/**
 * Techo de ancho de lo que se publica.
 *
 * El lugar más grande donde puede aparecer la imagen es el fondo del modal en
 * escritorio, unos 800 px de ancho; 1600 cubre eso al doble de densidad y no
 * más. Subir una foto de 6000 px no mejora nada de lo que se ve y le cuesta
 * medio segundo de carga a cada visitante del sitio.
 */
const ANCHO_MAX = 1600

/**
 * Sube la imagen normalizada y devuelve la ruta y sus medidas.
 *
 * SIEMPRE se reencodea, aunque el archivo ya sea WebP y ya sea chico. Es lo que
 * hace que "queda bien" no dependa de quién la subió:
 *
 *   · WebP con calidad fija: un JPG de 4 MB baja a unos 120 KB sin que se note
 *     en pantalla, y el popup abre al instante también con datos móviles.
 *   · `rotate()` sin argumentos aplica la orientación EXIF y la borra. Sin esto
 *     la foto sacada con el celular de costado entra acostada — el navegador la
 *     endereza al mostrarla suelta, pero no dentro de un `background` ni cuando
 *     se la recorta.
 *   · Los metadatos (GPS, modelo de cámara, nombre del autor) se pierden en el
 *     reencodeo, que es lo correcto para algo que se publica.
 *
 * `withoutEnlargement` es lo que garantiza que una imagen chica no se estire:
 * si no llega al mínimo se rechaza antes, no se agranda.
 */
export async function subirImagen(
  archivo: File
): Promise<{ ruta: string; ancho: number; alto: number } | { error: string }> {
  let normalizada: Buffer
  let ancho: number
  let alto: number

  try {
    const entrada = Buffer.from(await archivo.arrayBuffer())

    const meta = await sharp(entrada).metadata()
    // Con orientación 5-8 la foto viene acostada y el ancho real es el alto.
    const rotada = (meta.orientation ?? 1) >= 5
    const anchoReal = (rotada ? meta.height : meta.width) ?? 0

    if (anchoReal < IMAGEN_ANCHO_MIN) {
      return {
        error: `La imagen es chica: tiene ${anchoReal || "?"} px de ancho y hacen falta al menos ${IMAGEN_ANCHO_MIN}. Estirada se ve borrosa.`,
      }
    }

    const salida = await sharp(entrada)
      .rotate()
      .resize({ width: ANCHO_MAX, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true })

    normalizada = salida.data
    ancho = salida.info.width
    alto = salida.info.height
  } catch (e) {
    console.error("[popups sharp]", e)
    return { error: "No se pudo procesar la imagen. ¿Es un archivo válido?" }
  }

  // El nombre del archivo original no se usa como clave: subir dos veces
  // "evento.jpg" no puede pisar el primero, y los acentos y espacios en la
  // clave del objeto son una fuente de errores que no aporta nada.
  const ruta = `${crypto.randomUUID()}.webp`

  const { error } = await supabase.storage
    .from(BUCKET_POPUP)
    .upload(ruta, normalizada, { contentType: "image/webp", upsert: false })

  if (error) {
    console.error("[popups upload]", error)
    return { error: "No se pudo subir la imagen" }
  }

  return { ruta, ancho, alto }
}

/** Borra objetos del bucket sin hacer fallar a quien llama: si queda basura en
 *  Storage es mantenimiento, no algo que deba romperle la operación a la
 *  persona que estaba guardando. */
export async function borrarImagen(rutas: string[]): Promise<void> {
  const limpias = rutas.filter(Boolean)
  if (limpias.length === 0) return
  const { error } = await supabase.storage.from(BUCKET_POPUP).remove(limpias)
  if (error) console.error("[popups remove]", error)
}

/* ── Lectura del formulario ───────────────────────────────────────────────── */

/**
 * El alta y la edición llegan como `multipart/form-data` y no como JSON: la
 * imagen viaja en el mismo pedido que los datos. La alternativa —subir el
 * archivo primero y crear la fila después— deja un objeto huérfano en el bucket
 * cada vez que alguien cierra el diálogo a mitad de camino.
 *
 * El precio es que todo llega como texto. De ahí estos lectores: con dos copias,
 * una ruta recortaría el título a 60 caracteres y la otra no.
 */
export function campoTexto(form: FormData, campo: string, max: number): string {
  const v = form.get(campo)
  return typeof v === "string" ? v.trim().slice(0, max) : ""
}

/** Vacío se guarda como `null` y no como cadena vacía: en la base "sin bajada" y
 *  "bajada vacía" tienen que ser lo mismo, o los `check` de largo y los filtros
 *  empiezan a distinguir dos cosas que son una. */
export function campoOpcional(form: FormData, campo: string, max: number): string | null {
  return campoTexto(form, campo, max) || null
}

export function campoBool(form: FormData, campo: string): boolean {
  return form.get(campo) === "true"
}

export function campoEntero(form: FormData, campo: string, min: number, max: number, porDefecto: number): number {
  const n = Number(form.get(campo))
  if (!Number.isFinite(n)) return porDefecto
  return Math.min(max, Math.max(min, Math.round(n)))
}

/** Fecha del formulario → timestamptz, o `null`. Una fecha ilegible se guarda
 *  como "sin fecha" en vez de romper el guardado: el popup queda sin ventana de
 *  vigencia, que se ve y se corrige, en vez de perderse la carga entera. */
export function campoFecha(form: FormData, campo: string): string | null {
  const v = form.get(campo)
  if (typeof v !== "string" || !v.trim()) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/**
 * Las rutas donde se muestra. Llegan como una línea por página.
 *
 * Se normaliza cada una a "/algo": alguien va a pegar la URL entera del
 * navegador —https://www.accedra.com.ar/soluciones/networking— y comparar eso
 * contra el `pathname` no daría nunca.
 */
export function campoRutas(form: FormData, campo: string): string[] {
  const v = form.get(campo)
  if (typeof v !== "string") return []

  const rutas = v
    .split("\n")
    .map((linea) => linea.trim())
    .filter(Boolean)
    .map((linea) => {
      const sinDominio = linea.replace(/^https?:\/\/[^/]+/i, "")
      const conBarra = sinDominio.startsWith("/") ? sinDominio : `/${sinDominio}`
      // Sin la barra final: "/casos/" y "/casos" son la misma página y como
      // prefijo la versión con barra deja afuera a "/casos".
      return conBarra.length > 1 ? conBarra.replace(/\/+$/, "") : conBarra
    })
    .slice(0, LIMITES.rutas)

  return [...new Set(rutas)]
}

/**
 * El formulario entero → las columnas de la tabla, menos la imagen.
 *
 * La imagen se resuelve aparte en cada ruta porque el alta y la edición hacen
 * cosas distintas con ella (una la exige o no la pone, la otra la conserva, la
 * reemplaza o la saca). Todo lo demás es idéntico en las dos, y tenerlo dos
 * veces es la forma garantizada de que una ruta acepte un título de 60 y la
 * otra de 120.
 */
export function filaDelForm(form: FormData): Record<string, unknown> {
  const formato = form.get("formato")
  const accion = form.get("accion")
  const frecuencia = form.get("frecuencia")
  const alcance = form.get("alcance")

  return {
    nombre: campoTexto(form, "nombre", LIMITES.nombre),
    activo: campoBool(form, "activo"),

    formato: esFormato(formato) ? formato : "modal",

    etiqueta: campoOpcional(form, "etiqueta", LIMITES.etiqueta),
    titulo: campoTexto(form, "titulo", LIMITES.titulo),
    descripcion: campoOpcional(form, "descripcion", LIMITES.descripcion),
    imagen_alt: campoOpcional(form, "imagen_alt", LIMITES.imagenAlt),

    accion: esAccion(accion) ? accion : "mail",
    cta_texto: campoOpcional(form, "cta_texto", LIMITES.ctaTexto),
    cta_url: campoOpcional(form, "cta_url", LIMITES.ctaUrl),
    cta_nueva_pestana: campoBool(form, "cta_nueva_pestana"),
    mail_gracias: campoOpcional(form, "mail_gracias", LIMITES.mailGracias),
    cerrar_texto: campoOpcional(form, "cerrar_texto", LIMITES.cerrarTexto),

    desde: campoFecha(form, "desde"),
    hasta: campoFecha(form, "hasta"),
    demora_s: campoEntero(form, "demora_s", 0, 60, 6),
    frecuencia: esFrecuencia(frecuencia) ? frecuencia : "sesion",
    alcance: esAlcance(alcance) ? alcance : "todas",
    rutas: campoRutas(form, "rutas"),
  }
}

/**
 * Lo que el endpoint rechaza antes de tocar la base.
 *
 * Repite lo que ya valida el formulario, y tiene que repetirlo: el formulario es
 * comodidad, esto es la regla. Los `check` de la migración están abajo de los
 * dos, pero un error de Postgres llega como un texto que no le dice nada a nadie.
 */
export function problemaDeLaFila(fila: Record<string, unknown>): string | null {
  if (!fila.nombre) return "Falta el nombre interno"
  if (!fila.titulo) return "Falta el título"

  // Pidiendo el mail el botón se llama solo; llevando a una página, no puede
  // faltar el destino.
  if (fila.accion === "enlace") {
    const ctaTexto = fila.cta_texto as string | null
    const ctaUrl = fila.cta_url as string | null
    if (!ctaTexto) return "Falta el texto del botón"
    if (!ctaUrl) return "Falta la página a la que lleva el botón"
    if (!urlValida(ctaUrl)) return "El enlace tiene que empezar con https:// o con /"
  }

  if (fila.alcance === "rutas" && (fila.rutas as string[]).length === 0) {
    return "Elegiste páginas puntuales pero no cargaste ninguna"
  }

  const desde = fila.desde as string | null
  const hasta = fila.hasta as string | null
  if (desde && hasta && new Date(hasta) <= new Date(desde)) {
    return "La fecha de fin tiene que ser posterior a la de inicio"
  }

  return null
}
