/**
 * El mapeo de filas de la base a lo que consume la UI del calendario.
 *
 * Vive aparte porque ahora lo comparten cuatro rutas —la lista, el detalle, el
 * slot y la secuencia— y el día que una devuelva `template_slug` y otra
 * `templateSlug` la pantalla va a mostrar celdas vacías sin un solo error en la
 * consola. Es exactamente la clase de bug que no se encuentra leyendo.
 *
 * Solo servidor: importa el cliente de Supabase con service key.
 */

import { supabase } from "@/lib/supabase"
import { BUCKET_PIEZAS } from "@/lib/piezas"
import {
  esAudiencia,
  esCanal,
  esEstado,
  type Canal,
  type Contenido,
  type Opcion,
  type PlanBase,
  type Slot,
} from "@/lib/calendario-context"

/** Una hora. La misma que usa el historial de piezas. */
const FIRMA_SEGUNDOS = 60 * 60

/**
 * Las columnas del plan que necesita el home.
 *
 * Explícitas y no `*` porque `contexto` y `analisis` son párrafos largos que la
 * lista no dibuja: con diez planes, traerlos es un puñado de KB por una barrita
 * de progreso.
 */
export const columnasResumen =
  "id, titulo, nombre, estado, arco, analisis, fecha_inicio, dias, canales, contexto, audiencia, created_at"

type Fila = Record<string, unknown>

const texto = (v: unknown): string | null => (typeof v === "string" && v ? v : null)

export function aPlanBase(fila: Fila): PlanBase {
  const canales = Array.isArray(fila.canales) ? fila.canales.filter(esCanal) : []

  return {
    id: String(fila.id),
    titulo: String(fila.titulo ?? "Plan de contenido"),
    nombre: texto(fila.nombre),
    // Un plan anterior a la migración puede no tener estado si algo salió mal;
    // 'activo' es el default que no lo esconde de la lista.
    estado: esEstado(fila.estado) ? fila.estado : "activo",
    arco: texto(fila.arco),
    analisis: texto(fila.analisis),
    fechaInicio: String(fila.fecha_inicio),
    dias: Number(fila.dias) || 15,
    canales: canales as Canal[],
    contexto: texto(fila.contexto),
    // Los planes viejos con "ambos" caen acá: se leen como "todos".
    audiencia: esAudiencia(fila.audiencia) ? fila.audiencia : "todos",
    createdAt: String(fila.created_at),
  }
}

/**
 * Un slot, con la URL de su imagen ya firmada.
 *
 * La firma es una llamada por slot, así que los listados usan `aSlotsCliente`,
 * que las pide todas juntas. Un plan de once piezas haría once viajes en serie
 * y se notaría al abrir el detalle.
 */
export function aSlotCliente(s: Fila, imagenUrl: string | null = null): Slot {
  return {
    id: String(s.id),
    fecha: String(s.fecha),
    canal: (esCanal(s.canal) ? s.canal : "meta") as Canal,
    beat: texto(s.beat),
    opciones: (Array.isArray(s.opciones) ? s.opciones : []) as Opcion[],
    elegida: texto(s.elegida),
    contenido: (s.contenido ?? null) as Contenido | null,
    templateSlug: texto(s.template_slug),
    imagenPath: texto(s.imagen_path),
    imagenUrl,
  }
}

/** Los slots de un plan, con las firmas pedidas en paralelo. */
export async function aSlotsCliente(filas: Fila[]): Promise<Slot[]> {
  const urls = await firmar(filas.map((s) => texto(s.imagen_path)))
  return filas.map((s, i) => aSlotCliente(s, urls[i]))
}

/**
 * Firma un lote de rutas del bucket de piezas.
 *
 * `createSignedUrls` en plural: una sola llamada para todas. Y si falla, se
 * devuelven nulls en vez de romper — una imagen que no carga es una miniatura
 * vacía, no una pantalla en blanco.
 */
export async function firmar(rutas: (string | null)[]): Promise<(string | null)[]> {
  const presentes = [...new Set(rutas.filter((r): r is string => Boolean(r)))]
  if (presentes.length === 0) return rutas.map(() => null)

  const { data, error } = await supabase.storage
    .from(BUCKET_PIEZAS)
    .createSignedUrls(presentes, FIRMA_SEGUNDOS)

  if (error) {
    console.error("[calendario firmar]", error)
    return rutas.map(() => null)
  }

  const porRuta = new Map<string, string>()
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) porRuta.set(item.path, item.signedUrl)
  }

  return rutas.map((r) => (r ? (porRuta.get(r) ?? null) : null))
}
