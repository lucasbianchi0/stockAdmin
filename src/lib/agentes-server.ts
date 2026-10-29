import { supabase } from "@/lib/supabase"
import { esCategoria, esTipo, LIMITES } from "@/lib/marketing/notas"
import { slugLibre } from "@/lib/marketing/notas-server"
import {
  ORDEN,
  esClaveAgente,
  esEstadoPropuesta,
  type ClaveAgente,
  type Corrida,
  type DetalleAgente,
  type EstadoEntrada,
  type Propuesta,
  type ResumenAgente,
  type Trabajo,
} from "@/lib/agentes"

/** El historial de la ficha: medio año de entregas semanales. */
const HISTORIAL = 26

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

function aCorrida(f: Fila): Corrida {
  return {
    inicio: String(f.inicio),
    ok: Boolean(f.ok),
    detalle: (f.detalle as string | null) ?? null,
    origen: String(f.origen ?? "cron"),
  }
}

const esEstadoEntrada = (v: unknown): v is Exclude<EstadoEntrada, null> =>
  v === "activo" || v === "planificado" || v === "pausado"

/**
 * El equipo: de cada agente, si corrió, cuánto espera decisión y su última
 * entrega. Las propuestas se cuentan sobre las mismas entregas que muestra su
 * ficha, no sólo la última: una nota que quedó sin decidir hace dos domingos
 * sigue pendiente.
 *
 * Una consulta por agente, con tope: leer la tabla entera traía todas las
 * propuestas de la historia para contar las de medio año.
 */
export async function resumenDelEquipo(): Promise<ResumenAgente[]> {
  const [entradas, corridas, ...porAgente] = await Promise.all([
    supabase.from("calendario_entradas").select("clave, estado").in("clave", ORDEN),
    supabase
      .from("calendario_corridas")
      .select("clave, inicio, ok, detalle, origen")
      .in("clave", ORDEN)
      .order("inicio", { ascending: false })
      .limit(40),
    ...ORDEN.map((clave) =>
      supabase
        .from("agentes_trabajos")
        .select("titulo, propuestas, created_at")
        .eq("clave", clave)
        .order("created_at", { ascending: false })
        .limit(HISTORIAL)
    ),
  ])
  const fallo = porAgente.find((t) => t.error)?.error
  if (fallo) throw new Error(fallo.message)

  return ORDEN.map((clave, i) => {
    const estado = (entradas.data ?? []).find((e) => e.clave === clave)?.estado
    const corrida = (corridas.data ?? []).find((c) => c.clave === clave)
    const suyos = porAgente[i].data ?? []
    const pendientes = suyos
      .flatMap((t) => (Array.isArray(t.propuestas) ? t.propuestas : []))
      .filter((p: { estado?: string }) => (p.estado ?? "pendiente") === "pendiente").length
    return {
      clave,
      estado: esEstadoEntrada(estado) ? estado : null,
      ultimaCorrida: corrida ? aCorrida(corrida) : null,
      pendientes,
      entregas: suyos.length,
      ultimaEntrega: suyos[0] ? { titulo: String(suyos[0].titulo), creadoEn: String(suyos[0].created_at) } : null,
    }
  })
}

/** La ficha de un agente: todas sus entregas recientes y sus corridas. */
export async function detalleDeAgente(clave: ClaveAgente): Promise<DetalleAgente> {
  const [entrada, corridas, trabajos] = await Promise.all([
    supabase.from("calendario_entradas").select("estado").eq("clave", clave).maybeSingle(),
    supabase
      .from("calendario_corridas")
      .select("inicio, ok, detalle, origen")
      .eq("clave", clave)
      .order("inicio", { ascending: false })
      .limit(HISTORIAL),
    supabase
      .from("agentes_trabajos")
      .select(COLUMNAS_TRABAJO)
      .eq("clave", clave)
      .order("created_at", { ascending: false })
      .limit(HISTORIAL),
  ])
  if (trabajos.error) throw new Error(trabajos.error.message)

  return {
    clave,
    estado: esEstadoEntrada(entrada.data?.estado) ? entrada.data.estado : null,
    corridas: (corridas.data ?? []).map(aCorrida),
    trabajos: (trabajos.data ?? []).map(aTrabajo).filter((t): t is Trabajo => !!t),
  }
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
