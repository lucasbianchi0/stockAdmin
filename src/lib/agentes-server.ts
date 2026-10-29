import { supabase } from "@/lib/supabase"
import { esCategoria, esTipo, LIMITES } from "@/lib/marketing/notas"
import { slugLibre } from "@/lib/marketing/notas-server"
import {
  AGENTES,
  ORDEN,
  esClaveAgente,
  esEstadoPropuesta,
  type EstadoAgente,
  type Propuesta,
  type Trabajo,
} from "@/lib/agentes"

/** Cuántas entregas por agente se muestran: un mes, más o menos. */
const TRABAJOS_POR_AGENTE = 4

export const COLUMNAS_TRABAJO = "id, clave, titulo, resumen, propuestas, fuentes, revisado_por, revisado_en, created_at"

type Fila = Record<string, unknown>

function aPropuesta(p: unknown): Propuesta | null {
  if (!p || typeof p !== "object") return null
  const o = p as Record<string, unknown>
  if (typeof o.id !== "string") return null
  return {
    ...(o as Partial<Propuesta>),
    id: o.id,
    titulo: String(o.titulo ?? ""),
    detalle: String(o.detalle ?? ""),
    estado: esEstadoPropuesta(o.estado) ? o.estado : "pendiente",
  }
}

export function aTrabajo(f: Fila): Trabajo | null {
  if (!esClaveAgente(f.clave)) return null
  return {
    id: String(f.id),
    clave: f.clave,
    titulo: String(f.titulo ?? ""),
    resumen: String(f.resumen ?? ""),
    propuestas: (Array.isArray(f.propuestas) ? f.propuestas : []).map(aPropuesta).filter((p): p is Propuesta => !!p),
    fuentes: f.fuentes && typeof f.fuentes === "object" ? (f.fuentes as Record<string, string>) : {},
    revisadoPor: (f.revisado_por as string | null) ?? null,
    revisadoEn: (f.revisado_en as string | null) ?? null,
    creadoEn: String(f.created_at),
  }
}

/** Los cuatro agentes con su estado en el Calendario, la última corrida y las últimas entregas. */
export async function estadoDeLosAgentes(): Promise<EstadoAgente[]> {
  const [entradas, corridas, trabajos] = await Promise.all([
    supabase.from("calendario_entradas").select("clave, estado").in("clave", ORDEN),
    supabase
      .from("calendario_corridas")
      .select("clave, inicio, ok, detalle")
      .in("clave", ORDEN)
      .order("inicio", { ascending: false })
      .limit(40),
    supabase
      .from("agentes_trabajos")
      .select(COLUMNAS_TRABAJO)
      .order("created_at", { ascending: false })
      .limit(ORDEN.length * TRABAJOS_POR_AGENTE * 2),
  ])
  if (trabajos.error) throw new Error(trabajos.error.message)

  return ORDEN.map((clave) => {
    const entrada = (entradas.data ?? []).find((e) => e.clave === clave)
    const corrida = (corridas.data ?? []).find((c) => c.clave === clave)
    return {
      ficha: AGENTES[clave],
      estado: (entrada?.estado as EstadoAgente["estado"]) ?? null,
      ultimaCorrida: corrida
        ? { inicio: String(corrida.inicio), ok: Boolean(corrida.ok), detalle: (corrida.detalle as string | null) ?? null }
        : null,
      trabajos: (trabajos.data ?? [])
        .filter((t) => t.clave === clave)
        .slice(0, TRABAJOS_POR_AGENTE)
        .map(aTrabajo)
        .filter((t): t is Trabajo => !!t),
    }
  })
}

/**
 * El borrador de una nota propuesta por el agente del blog. El cuerpo trae los
 * subtítulos ya puestos y, arriba, lo que el agente pensó: la keyword y para
 * quién es. Esa primera sección está para borrarse antes de publicar.
 */
export async function crearNotaDesdePropuesta(
  p: Propuesta,
  autor: { id: string | null; nombre: string }
): Promise<{ id: string } | { error: string }> {
  const titulo = p.titulo.slice(0, LIMITES.titulo)
  const guia = [
    "## Para quien escribe (borrar antes de publicar)",
    "",
    `- **Keyword:** ${p.keyword ?? "-"}`,
    `- **Para quién:** ${p.intencion ?? "-"}`,
    `- **Por qué esta nota:** ${p.porQue ?? "-"}`,
    "",
  ]
  const secciones = (p.puntos ?? []).flatMap((s) => [`## ${s.replace(/^#+\s*/, "")}`, "", ""])

  const { data, error } = await supabase
    .from("notas")
    .insert({
      slug: await slugLibre(titulo),
      publicado: false,
      tipo: esTipo(p.tipo) ? p.tipo : "nota",
      titulo,
      resumen: p.detalle.slice(0, LIMITES.resumen) || null,
      categoria: esCategoria(p.categoria) ? p.categoria : null,
      cuerpo: [...guia, ...secciones].join("\n").slice(0, LIMITES.cuerpo),
      autor_id: autor.id,
      autor_nombre: autor.nombre,
    })
    .select("id")
    .single()

  if (error || !data) return { error: error?.message ?? "No se pudo crear la nota" }
  return { id: String(data.id) }
}
