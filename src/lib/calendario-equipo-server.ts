import { timingSafeEqual } from "node:crypto"

import { supabase } from "@/lib/supabase"
import { listarEquipo } from "@/lib/tickets-server"
import {
  LIMITES,
  esClave,
  esEjecutor,
  esEstado,
  esFecha,
  esHora,
  esRepeticion,
  esTipo,
  enArgentina,
  type Corrida,
  type Entrada,
  type Usuario,
} from "@/lib/calendario-equipo"

/**
 * Calendario del equipo — lo que sólo corre en el servidor.
 *
 * El equipo es el mismo de la ticketera (`listarEquipo`): quien puede tener un
 * ticket asignado es quien puede tener una reunión en el calendario.
 */

export const COLUMNAS_ENTRADA =
  "id, tipo, titulo, descripcion, fecha, hora, duracion_min, repeticion, dias_semana, intervalo_min, hasta, personas, ejecutor, clave, estado, autor_nombre, created_at"

export const COLUMNAS_CORRIDA = "id, clave, inicio, fin, ok, detalle, origen"

type Fila = Record<string, unknown>

export function aEntrada(f: Fila): Entrada {
  return {
    id: String(f.id),
    tipo: esTipo(f.tipo) ? f.tipo : "persona",
    titulo: String(f.titulo ?? ""),
    descripcion: (f.descripcion as string | null) ?? null,
    fecha: String(f.fecha),
    // Postgres devuelve `09:00:00`; la pantalla habla en `09:00`.
    hora: typeof f.hora === "string" ? f.hora.slice(0, 5) : null,
    duracionMin: Number(f.duracion_min ?? 60),
    repeticion: esRepeticion(f.repeticion) ? f.repeticion : "nunca",
    diasSemana: Array.isArray(f.dias_semana) ? f.dias_semana.map(Number) : [],
    intervaloMin: f.intervalo_min == null ? null : Number(f.intervalo_min),
    hasta: (f.hasta as string | null) ?? null,
    personas: Array.isArray(f.personas) ? (f.personas as Usuario[]) : [],
    ejecutor: esEjecutor(f.ejecutor) ? f.ejecutor : null,
    clave: (f.clave as string | null) ?? null,
    estado: esEstado(f.estado) ? f.estado : "activo",
    autorNombre: String(f.autor_nombre ?? ""),
    creadaEl: f.created_at ? enArgentina(String(f.created_at))[0] : String(f.fecha),
  }
}

export function aCorrida(f: Fila): Corrida {
  return {
    id: String(f.id),
    clave: String(f.clave),
    inicio: String(f.inicio),
    fin: (f.fin as string | null) ?? null,
    ok: Boolean(f.ok),
    detalle: (f.detalle as string | null) ?? null,
    origen: f.origen === "manual" || f.origen === "agente" ? f.origen : "cron",
  }
}

/**
 * Lo que manda el formulario, validado y listo para la base.
 *
 * Devuelve el error en castellano para mostrarlo tal cual. Los nombres de las
 * personas se resuelven contra el equipo real: si viajaran desde el navegador,
 * cualquiera podría anotar una reunión "con el directorio".
 */
export async function normalizarEntrada(
  body: Record<string, unknown>
): Promise<{ error: string } | { fila: Record<string, unknown> }> {
  const tipo = body.tipo
  if (!esTipo(tipo)) return { error: "Tipo inválido" }

  const titulo = typeof body.titulo === "string" ? body.titulo.trim().slice(0, LIMITES.titulo) : ""
  if (!titulo) return { error: "Falta el título." }

  if (!esFecha(body.fecha)) return { error: "Falta la fecha." }
  const repeticion = esRepeticion(body.repeticion) ? body.repeticion : "nunca"
  if (repeticion === "continua" && tipo === "persona") {
    return { error: "Una tarea de una persona no se repite cada pocos minutos." }
  }

  const hora = esHora(body.hora) ? body.hora : null
  const hasta = esFecha(body.hasta) ? body.hasta : null
  if (hasta && hasta < body.fecha) return { error: "La repetición termina antes de empezar." }

  const diasSemana =
    repeticion === "semanal" && Array.isArray(body.diasSemana)
      ? [...new Set(body.diasSemana.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))]
      : []

  const intervalo = Number(body.intervaloMin)
  const intervaloMin =
    repeticion === "continua" && Number.isInteger(intervalo) && intervalo >= 1 && intervalo <= 1440
      ? intervalo
      : repeticion === "continua"
        ? 15
        : null

  const duracion = Number(body.duracionMin)
  const duracionMin = Number.isInteger(duracion) && duracion >= 5 && duracion <= 1440 ? duracion : 60

  const equipo = await listarEquipo()
  const ids = Array.isArray(body.personas) ? body.personas : []
  const personas = equipo.filter((u) => ids.includes(u.id))

  const maquina = tipo !== "persona"
  const clave = maquina && typeof body.clave === "string" ? body.clave.trim().toLowerCase() : ""
  if (clave && !esClave(clave)) {
    return { error: "La clave va en minúsculas, con números y guiones: «agente-ads»." }
  }

  return {
    fila: {
      tipo,
      titulo,
      descripcion:
        typeof body.descripcion === "string" && body.descripcion.trim()
          ? body.descripcion.trim().slice(0, LIMITES.descripcion)
          : null,
      fecha: body.fecha,
      hora,
      duracion_min: duracionMin,
      repeticion,
      dias_semana: diasSemana,
      intervalo_min: intervaloMin,
      hasta: repeticion === "nunca" ? null : hasta,
      personas,
      ejecutor: maquina && esEjecutor(body.ejecutor) ? body.ejecutor : null,
      clave: clave || null,
      // Lo de una persona está activo siempre: "planificado" es para las
      // máquinas que todavía no existen.
      estado: maquina && esEstado(body.estado) ? body.estado : "activo",
      updated_at: new Date().toISOString(),
    },
  }
}

/* ── Corridas ─────────────────────────────────────────────────────────────── */

/**
 * Anota que un proceso o agente corrió.
 *
 * Nunca tira: es la libreta de bitácora del proceso, no el proceso. Si anotar
 * falla, lo que corrió ya corrió, y romperlo por no poder contarlo sería el
 * peor de los dos resultados.
 */
export async function registrarCorrida(c: {
  clave: string
  ok: boolean
  detalle?: string | null
  inicio?: string
  origen?: Corrida["origen"]
}): Promise<void> {
  try {
    const { error } = await supabase.from("calendario_corridas").insert({
      clave: c.clave,
      ok: c.ok,
      detalle: c.detalle?.slice(0, 500) ?? null,
      inicio: c.inicio ?? new Date().toISOString(),
      fin: new Date().toISOString(),
      origen: c.origen ?? "cron",
    })
    if (error) console.error("[calendario corrida]", c.clave, error.message)
  } catch (e) {
    console.error("[calendario corrida]", c.clave, e)
  }
}

/** El secreto de los crons, comparado en tiempo constante. */
export function esSecretoDeCron(req: Request): boolean {
  const esperado = process.env.CRON_SECRET
  if (!esperado) return false
  const recibido = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? ""
  const a = Buffer.from(recibido)
  const b = Buffer.from(esperado)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
