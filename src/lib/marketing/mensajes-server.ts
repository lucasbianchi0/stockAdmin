/**
 * Fila de `mensajes_plantilla` → lo que consume la pantalla.
 *
 * Vive aparte porque lo comparten las cuatro rutas (lista, alta, edición y
 * copia) y el día que una devuelva `cuando_usar` y otra `cuandoUsar` la ficha se
 * va a dibujar sin criterio de uso y sin un solo error en la consola.
 *
 * Solo servidor: importa el cliente con service key.
 */

import {
  esCanal,
  esCircunstancia,
  type MensajePlantilla,
} from "@/lib/marketing/mensajes"

/**
 * Explícitas y no `*`: `cuerpo` puede tener cuatro mil caracteres y la lista los
 * necesita todos igual —la ficha se abre sin volver a pedir nada—, pero dejar el
 * asterisco significa que cualquier columna que se agregue mañana viaja sola en
 * cada request sin que nadie lo decida.
 */
// En una sola línea y sin concatenar: el tipado de supabase-js lee esta cadena
// como literal para inferir la forma de la fila, y un `"a" + "b"` la degrada a
// `string` — con lo que `data` pasa a ser un error genérico y no una fila.
export const COLUMNAS_MENSAJE =
  "id, titulo, circunstancia, canal, asunto, cuerpo, cuando_usar, etiquetas, autor_id, autor_nombre, editor_nombre, usos, created_at, updated_at"

type Fila = Record<string, unknown>

const texto = (v: unknown): string | null => (typeof v === "string" && v ? v : null)

export function aMensaje(fila: Fila): MensajePlantilla {
  return {
    id: String(fila.id),
    titulo: String(fila.titulo ?? ""),
    // El check de la base ya garantiza el valor; el fallback cubre el hueco
    // entre desplegar una circunstancia nueva y desplegar el código que la
    // conoce, que es donde la pantalla se rompería.
    circunstancia: esCircunstancia(fila.circunstancia) ? fila.circunstancia : "otra",
    canal: esCanal(fila.canal) ? fila.canal : "otro",
    asunto: texto(fila.asunto),
    cuerpo: String(fila.cuerpo ?? ""),
    cuandoUsar: texto(fila.cuando_usar),
    etiquetas: Array.isArray(fila.etiquetas)
      ? fila.etiquetas.filter((e): e is string => typeof e === "string")
      : [],
    autorId: texto(fila.autor_id),
    autorNombre: String(fila.autor_nombre ?? "Alguien"),
    editorNombre: texto(fila.editor_nombre),
    usos: Number(fila.usos) || 0,
    createdAt: String(fila.created_at),
    updatedAt: String(fila.updated_at ?? fila.created_at),
  }
}
