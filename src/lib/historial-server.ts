/**
 * La línea de publicaciones: todo lo que alguna vez se escribió, por canal.
 *
 * Es la memoria del banco, y existe porque la anterior no era memoria sino
 * inventario. "Lo que ya se escribió" se leía de las piezas vivas de
 * `content_slots`, y eso tenía dos agujeros por los que volvía la repetición:
 *
 *  1. DESCARTAR UNA PIEZA LIBERABA SU TITULAR. La idea desaparecía de la
 *     consulta y el lote siguiente podía escribirla de nuevo — justo la que ya
 *     se había mirado y decidido que no servía.
 *  2. La consulta traía las últimas cuarenta. Al sexto lote, el banco ya no se
 *     acordaba de lo que había escrito en el primero.
 *
 * Acá no se borra nunca. Una fila del historial no es contenido: es la
 * constancia de que ese titular ya existió. Y `content_historial` tiene un
 * índice único sobre (canal, clave), así que la garantía no depende de que este
 * módulo esté bien escrito.
 *
 * Solo servidor: importa el cliente de Supabase con service key.
 */

import { supabase } from "@/lib/supabase"
import { claveTitular } from "@/lib/copy-headline"
import type { Canal, Opcion } from "@/lib/calendario-context"

export type EntradaHistorial = {
  headline: string
  titulo: string
  tesis: string | null
  /** La línea de servicio del catálogo sobre la que se escribió. */
  linea: string | null
  /** El ángulo con el que se contó. Ver `EJES` en la ruta del lote. */
  eje: string | null
  patron: string | null
  objetivo: string | null
}

/**
 * Cuántas entradas del historial viajan al prompt.
 *
 * El historial completo crece sin techo y no puede entrar entero en cada
 * llamada. Sesenta son unas ocho generaciones de lote: alcanza para que el
 * modelo vea de qué se viene hablando y no vuelva sobre lo mismo, y son ~1.200
 * tokens, que al lado de los 4.400 del brand kit no mueven la aguja.
 *
 * Que el prompt no las vea TODAS no afloja la garantía: el filtro por clave se
 * aplica contra el historial entero, no contra este recorte. La lista del
 * prompt es lo que evita que el modelo escriba una variante; el filtro es lo
 * que evita que un duplicado exacto entre.
 */
const AL_PROMPT = 60

/** Lo último que se escribió en un canal, para mostrárselo al modelo. */
export async function historialReciente(canal: Canal): Promise<EntradaHistorial[]> {
  const { data, error } = await supabase
    .from("content_historial")
    .select("headline, titulo, tesis, linea, eje, patron, objetivo")
    .eq("canal", canal)
    .order("created_at", { ascending: false })
    .limit(AL_PROMPT)

  if (error) {
    console.error("[historial reciente]", error)
    return []
  }

  return (data ?? []) as EntradaHistorial[]
}

/**
 * TODAS las huellas, de LOS DOS canales. Es el filtro, no la sugerencia.
 *
 * Global y no por canal a propósito: un titular literal no se repite nunca, ni
 * siquiera en la otra red. Se vio pasar —"400 sucursales no se capacitan solas"
 * salió igual en LinkedIn y en Instagram— porque los dos bancos se generan por
 * separado y ninguno veía al otro.
 *
 * Lo que sí puede cruzarse es el TEMA: la misma idea contada para decisores en
 * doscientas palabras y para el feed en sesenta son dos piezas distintas, y eso
 * es publicar en dos redes, no repetirse. Por eso la lista de temas gastados
 * que va al prompt sigue siendo por canal y solo el titular literal se bloquea
 * de los dos lados.
 *
 * Se traen solo las claves —no el texto— para poder traerlas todas sin que pese:
 * son cadenas cortas y lo único que se hace con ellas es un `Set.has`.
 */
export async function clavesUsadas(): Promise<Set<string>> {
  const { data, error } = await supabase.from("content_historial").select("clave")

  if (error) {
    console.error("[historial claves]", error)
    return new Set()
  }

  return new Set((data ?? []).map((f) => String(f.clave)))
}

/** Lo último del OTRO canal, para que el mismo tema no salga con el mismo titular. */
export async function historialDelOtroCanal(canal: Canal): Promise<string[]> {
  const otro: Canal = canal === "linkedin" ? "meta" : "linkedin"

  const { data, error } = await supabase
    .from("content_historial")
    .select("headline")
    .eq("canal", otro)
    .order("created_at", { ascending: false })
    .limit(25)

  if (error) {
    console.error("[historial otro canal]", error)
    return []
  }

  return (data ?? []).map((f) => String(f.headline))
}

/**
 * Anota las ideas nuevas. Se llama SIEMPRE que se genera una idea, la pieza
 * después se use o se descarte.
 *
 * `ignoreDuplicates` y no un upsert que pise: la primera vez que se escribió un
 * titular es la que vale, y una segunda inserción con la misma clave es
 * exactamente lo que hay que dejar pasar sin romper —puede ocurrir si dos lotes
 * del mismo canal corren a la vez, que es raro pero no imposible—.
 *
 * No lanza. Un fallo acá significa que el historial se quedó corto, y eso es
 * peor la próxima vez que se genere; frenar un lote ya generado y pagado
 * porque no se pudo anotar sería peor ahora.
 */
export async function anotarEnHistorial(
  canal: Canal,
  ideas: Opcion[],
  contexto?: Map<string, { linea?: string; eje?: string }>,
  /** Con qué composición se escribió. Ver la migración `tema_pieza`. */
  tema: "oscuro" | "claro" = "oscuro"
): Promise<void> {
  const filas = ideas
    .filter((o) => o.headline.trim())
    .map((o) => {
      const extra = contexto?.get(o.headline) ?? {}
      return {
        canal,
        tema,
        clave: claveTitular(o.headline),
        headline: o.headline,
        titulo: o.titulo,
        tesis: o.tesis || null,
        linea: extra.linea ?? null,
        eje: extra.eje ?? null,
        patron: o.patron || null,
        objetivo: o.objetivo || null,
      }
    })
    .filter((f) => f.clave)

  if (filas.length === 0) return

  const { error } = await supabase
    .from("content_historial")
    .upsert(filas, { onConflict: "canal,clave", ignoreDuplicates: true })

  if (error) console.error("[historial anotar]", error)
}
