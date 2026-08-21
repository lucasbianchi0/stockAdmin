/**
 * El lado servidor del banco: el plan contenedor y el mapeo de filas.
 *
 * Vive aparte de `calendario-server.ts` porque la forma que consume la UI es
 * distinta —una pieza del banco no tiene beat, ni opciones a elegir, ni plan al
 * que pertenecer— pero se apoya en lo mismo: las filas son `content_slots` y las
 * URLs se firman con el mismo helper. Duplicar la firma sería garantizar que un
 * día una de las dos pantallas muestre miniaturas rotas.
 *
 * Solo servidor: importa el cliente de Supabase con service key.
 */

import { supabase } from "@/lib/supabase"
import { firmar } from "@/lib/calendario-server"
import { esCanal, type Canal, type Contenido, type Opcion } from "@/lib/calendario-context"
import { BANCO_LABEL, type PiezaBanco } from "@/lib/banco-context"

type Fila = Record<string, unknown>

const texto = (v: unknown): string | null => (typeof v === "string" && v ? v : null)

/**
 * La idea de una pieza del banco.
 *
 * Se guarda en `opciones` —la misma columna donde el calendario guarda las
 * propuestas— con un solo elemento. No es un abuso de la columna: una pieza del
 * banco es literalmente un slot con una sola opción ya elegida, que es el estado
 * al que llega un slot del calendario apenas se genera el plan.
 */
export function ideaDeFila(fila: Fila): Opcion | null {
  const opciones = Array.isArray(fila.opciones) ? (fila.opciones as Opcion[]) : []
  return opciones[0] ?? null
}

export function aPiezaBanco(fila: Fila, imagenUrl: string | null = null): PiezaBanco | null {
  const idea = ideaDeFila(fila)
  // Una fila sin idea no se puede dibujar ni regenerar: es basura de una
  // inserción a medias. Se omite en vez de renderizar una tarjeta vacía.
  if (!idea) return null

  return {
    id: String(fila.id),
    canal: (esCanal(fila.canal) ? fila.canal : "meta") as Canal,
    orden: Number(fila.orden) || 0,
    idea,
    contenido: (fila.contenido ?? null) as Contenido | null,
    templateSlug: texto(fila.template_slug),
    imagenPath: texto(fila.imagen_path),
    imagenUrl,
    programada: texto(fila.programada),
    createdAt: String(fila.created_at),
  }
}

/** Un lote de filas, con las firmas pedidas todas juntas. */
export async function aPiezasBanco(filas: Fila[]): Promise<PiezaBanco[]> {
  const urls = await firmar(filas.map((f) => texto(f.imagen_path)))
  return filas
    .map((f, i) => aPiezaBanco(f, urls[i]))
    .filter((p): p is PiezaBanco => p !== null)
}

/**
 * El plan contenedor del banco de un canal, creándolo si no existe.
 *
 * Existe solo porque `content_slots.plan_id` es not null. No tiene arco, ni
 * contexto, ni días: es una carpeta. Uno por canal y no uno global para que la
 * consulta del banco sea un `eq` y no un filtro sobre todas las piezas.
 *
 * La creación es idempotente por el `select` previo. No hay unique constraint
 * sobre (tipo, canales) a propósito: agregarla obligaría a un índice sobre un
 * array por una carrera que, en un backoffice de un puñado de usuarios, no
 * ocurre — y si ocurriera, el peor caso es un plan contenedor duplicado y vacío.
 */
export async function planDelBanco(canal: Canal): Promise<string> {
  const { data: existente } = await supabase
    .from("content_plans")
    .select("id")
    .eq("tipo", "banco")
    .contains("canales", [canal])
    .limit(1)
    .maybeSingle()

  if (existente?.id) return String(existente.id)

  const { data, error } = await supabase
    .from("content_plans")
    .insert({
      titulo: `Banco · ${BANCO_LABEL[canal]}`,
      tipo: "banco",
      // Sin arco: el banco no cuenta una historia, junta piezas.
      arco: null,
      fecha_inicio: new Date().toISOString().slice(0, 10),
      dias: 1,
      canales: [canal],
      audiencia: "todos",
      estado: "activo",
    })
    .select("id")
    .single()

  if (error || !data) {
    console.error("[banco planDelBanco]", error)
    throw new Error("No se pudo preparar el banco")
  }

  return String(data.id)
}

/** Las columnas que necesita una pieza. Explícitas: `beat` y `elegida` no se usan. */
export const columnasPieza =
  "id, canal, orden, opciones, contenido, template_slug, imagen_path, programada, created_at"

/**
 * Las piezas de un banco, o las programadas de un rango.
 *
 * Las dos consultas viven acá y no en sus rutas porque comparten el filtro que
 * define qué es una pieza del banco (`origen = 'banco'`), y ese filtro repetido
 * en dos archivos es lo que hace que un día la agenda muestre piezas del
 * calendario viejo.
 */
export async function piezasDelBanco(canal: Canal): Promise<PiezaBanco[]> {
  const planId = await planDelBanco(canal)

  const { data, error } = await supabase
    .from("content_slots")
    .select(columnasPieza)
    .eq("plan_id", planId)
    .eq("origen", "banco")
    .is("programada", null)
    .order("orden", { ascending: true })

  if (error) {
    console.error("[banco piezasDelBanco]", error)
    return []
  }

  return aPiezasBanco(data ?? [])
}

export async function piezasProgramadas(desde: string, hasta: string): Promise<PiezaBanco[]> {
  const { data, error } = await supabase
    .from("content_slots")
    .select(columnasPieza)
    .eq("origen", "banco")
    .not("programada", "is", null)
    .gte("programada", desde)
    .lte("programada", hasta)
    .order("programada", { ascending: true })

  if (error) {
    console.error("[banco piezasProgramadas]", error)
    return []
  }

  return aPiezasBanco(data ?? [])
}

/** Todas las fechas ya ocupadas, para poder proponer la siguiente. */
export async function fechasOcupadas(): Promise<string[]> {
  const { data, error } = await supabase
    .from("content_slots")
    .select("programada")
    .eq("origen", "banco")
    .not("programada", "is", null)

  if (error) {
    console.error("[banco fechasOcupadas]", error)
    return []
  }

  return (data ?? []).map((f) => String(f.programada)).filter(Boolean)
}
