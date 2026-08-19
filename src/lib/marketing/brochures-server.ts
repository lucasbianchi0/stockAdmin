/**
 * Fila de `brochures` → lo que consume la pantalla, con la URL del PDF firmada.
 *
 * Vive aparte porque lo comparten las cuatro rutas (lista, alta, edición y
 * descarga) y el día que una devuelva `archivo_nombre` y otra `archivoNombre` la
 * ficha se va a dibujar sin nombre de archivo y sin un solo error en la consola.
 *
 * Solo servidor: importa el cliente con service key.
 */

import { supabase } from "@/lib/supabase"
import {
  esIndustria,
  esSolucion,
  normalizarEtiquetas,
  type Brochure,
} from "@/lib/marketing/brochures"

/** El bucket, privado. Ver el comentario de la migración. */
export const BUCKET_BROCHURES = "brochures"

/**
 * Una hora. Alcanza de sobra para abrir el PDF, leerlo y descargarlo, y si la
 * pestaña queda abierta toda la tarde el enlace ya no sirve.
 */
const VENCIMIENTO_S = 3600

/**
 * Explícitas y no `*`: dejar el asterisco significa que cualquier columna que se
 * agregue mañana viaja sola en cada request sin que nadie lo decida.
 */
// En una sola línea y sin concatenar: el tipado de supabase-js lee esta cadena
// como literal para inferir la forma de la fila, y un `"a" + "b"` la degrada a
// `string` — con lo que `data` pasa a ser un error genérico y no una fila.
export const COLUMNAS_BROCHURE =
  "id, titulo, solucion, industria, descripcion, cuando_usar, etiquetas, archivo_ruta, archivo_nombre, archivo_tamano, version, autor_id, autor_nombre, editor_nombre, descargas, created_at, updated_at"

type Fila = Record<string, unknown>

const texto = (v: unknown): string | null => (typeof v === "string" && v ? v : null)

/** La fila sin la URL. La ruta se devuelve aparte porque es lo que se firma y lo
 *  que se borra, pero nunca sale hacia el cliente: es la dirección real del
 *  objeto en el bucket. */
function aBrochureSinUrl(fila: Fila): { brochure: Omit<Brochure, "url">; ruta: string } {
  return {
    ruta: String(fila.archivo_ruta ?? ""),
    brochure: {
      id: String(fila.id),
      titulo: String(fila.titulo ?? ""),
      // El check de la base ya garantiza el valor; el fallback cubre el hueco
      // entre desplegar una solución nueva y desplegar el código que la conoce,
      // que es donde la pantalla se rompería.
      solucion: esSolucion(fila.solucion) ? fila.solucion : "otra",
      industria: esIndustria(fila.industria) ? fila.industria : null,
      descripcion: texto(fila.descripcion),
      cuandoUsar: texto(fila.cuando_usar),
      etiquetas: Array.isArray(fila.etiquetas)
        ? fila.etiquetas.filter((e): e is string => typeof e === "string")
        : [],
      archivoNombre: String(fila.archivo_nombre ?? "brochure.pdf"),
      archivoTamano: typeof fila.archivo_tamano === "number" ? fila.archivo_tamano : null,
      version: Number(fila.version) || 1,
      autorId: texto(fila.autor_id),
      autorNombre: String(fila.autor_nombre ?? "Alguien"),
      editorNombre: texto(fila.editor_nombre),
      descargas: Number(fila.descargas) || 0,
      createdAt: String(fila.created_at),
      updatedAt: String(fila.updated_at ?? fila.created_at),
    },
  }
}

/**
 * Las filas con su PDF firmado, en un solo pedido a Storage.
 *
 * De a una serían veinte viajes para listar veinte brochures. `createSignedUrls`
 * los resuelve en uno, y el que falle vuelve con `url: null` — la fila igual se
 * muestra, con el botón de abrir apagado, que es mucho mejor que perder la lista
 * entera porque un objeto quedó huérfano en el bucket.
 */
export async function conUrls(filas: Fila[]): Promise<Brochure[]> {
  if (filas.length === 0) return []

  const parseadas = filas.map(aBrochureSinUrl)

  const { data: firmadas, error } = await supabase.storage
    .from(BUCKET_BROCHURES)
    .createSignedUrls(
      parseadas.map((p) => p.ruta),
      VENCIMIENTO_S
    )

  if (error) console.error("[brochures firmar]", error)

  const porRuta = new Map((firmadas ?? []).map((f) => [f.path, f.signedUrl]))

  return parseadas.map(({ brochure, ruta }) => ({
    ...brochure,
    url: porRuta.get(ruta) ?? null,
  }))
}

/**
 * Sube el PDF al bucket y devuelve la ruta.
 *
 * La ruta lleva un uuid y no el nombre del archivo por dos motivos: subir dos
 * veces "propuesta.pdf" no puede pisar el primero, y un nombre con acentos o
 * espacios en la clave del objeto es una fuente de errores de firma que no
 * aporta nada —el nombre real viaja en `archivo_nombre`, que es el que se usa al
 * descargar—.
 */
export async function subirPdf(archivo: File): Promise<{ ruta: string } | { error: string }> {
  const ruta = `${crypto.randomUUID()}.pdf`

  const { error } = await supabase.storage
    .from(BUCKET_BROCHURES)
    .upload(ruta, archivo, { contentType: "application/pdf", upsert: false })

  if (error) {
    console.error("[brochures upload]", error)
    return { error: "No se pudo subir el PDF" }
  }

  return { ruta }
}

/* ── Lectura del formulario ────────────────────────────────────────────────── */

/**
 * El alta y la edición llegan como `multipart/form-data` y no como JSON.
 *
 * No es una preferencia: el PDF viaja en el mismo pedido que los datos. La
 * alternativa —subir el archivo primero y después crear la fila— deja un objeto
 * huérfano en el bucket cada vez que alguien cierra el diálogo a mitad de camino.
 *
 * El precio es que todo llega como texto, incluidas las etiquetas, que viajan
 * como JSON dentro de un campo. De ahí este lector compartido: con dos copias,
 * una ruta recortaría el título a 120 caracteres y la otra no.
 */
export function textoDelForm(form: FormData, campo: string, max: number): string | null {
  const v = form.get(campo)
  if (typeof v !== "string") return null
  return v.trim().slice(0, max)
}

/** Las etiquetas del form, que viajan como JSON. Un campo ausente devuelve
 *  `null` (no tocar) y uno presente pero ilegible, lista vacía. */
export function etiquetasDelForm(form: FormData): string[] | null {
  const v = form.get("etiquetas")
  if (typeof v !== "string") return null
  try {
    return normalizarEtiquetas(JSON.parse(v))
  } catch {
    return []
  }
}

/** Borra objetos del bucket sin hacer fallar a quien llama: si queda basura en
 *  Storage es un problema de mantenimiento, no algo que deba romperle la
 *  operación a la persona que estaba guardando. */
export async function borrarDelBucket(rutas: string[]): Promise<void> {
  if (rutas.length === 0) return
  const { error } = await supabase.storage.from(BUCKET_BROCHURES).remove(rutas)
  if (error) console.error("[brochures remove]", error)
}
