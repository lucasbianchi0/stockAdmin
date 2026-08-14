import { supabase } from "@/lib/supabase"
import { TEMPLATES, type TemplatePieza } from "@/lib/templates-pieza"

/**
 * Qué formatos siguen en juego.
 *
 * La receta de cada template vive en el código; la base guarda una sola cosa
 * sobre ellos: cuáles quedaron archivados. Es la división que permite sacar un
 * formato de circulación sin desplegar.
 *
 * Archivar y no borrar, por dos razones. Las piezas ya generadas guardan el slug
 * en `template_id`, y si la definición desaparece el historial pasa a mostrar un
 * id crudo en vez de un nombre. Y el sembrado de `templates` compara contra el
 * código: una fila borrada volvería a aparecer sola en la siguiente carga.
 */
export async function slugsArchivados(): Promise<Set<string>> {
  const { data, error } = await supabase.from("templates").select("slug").eq("activo", false)

  if (error) {
    // Falla abierto a propósito: ofrecer un formato de más es molesto, dejar al
    // calendario sin ninguno con el que armar la secuencia lo rompe entero.
    console.error("[templates archivados]", error)
    return new Set()
  }

  return new Set((data ?? []).map((f) => String(f.slug)))
}

/**
 * Los templates disponibles para generar y para secuenciar.
 *
 * Si no quedara ninguno se devuelven todos: es preferible ignorar el archivado a
 * dejar sin formato a un plan entero.
 */
export async function templatesActivos(): Promise<TemplatePieza[]> {
  const archivados = await slugsArchivados()
  const activos = TEMPLATES.filter((t) => !archivados.has(t.id))
  return activos.length > 0 ? activos : TEMPLATES
}
