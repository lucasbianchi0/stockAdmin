/**
 * Lo que comparten los cuatro agentes: hablar con Claude, las fechas de la
 * semana y el contexto de qué vende Accedra.
 *
 * Corre con tsx (no con Next), así que importa las librerías de la app por el
 * alias `@/` igual que una ruta, y lee las mismas variables de entorno.
 */
import { crearClienteClaude } from "@/lib/anthropic"
import type { Propuesta } from "@/lib/agentes"

/** Un juicio con criterio una vez por semana: el modelo grande, como la revisión de notas. */
const MODELO = "claude-opus-5"

/** Lo que devuelve un agente, antes de guardarse. */
export type Entrega = {
  titulo: string
  resumen: string
  propuestas: Omit<Propuesta, "id" | "estado">[]
  fuentes: Record<string, string>
  /** Una línea para el Calendario: "3 notas propuestas". */
  detalle: string
}

/**
 * Lo que Claude tiene que saber de Accedra antes de proponer nada. Corto a
 * propósito: lo que lo aleja de las malas ideas son las dos prohibiciones.
 */
export const CONTEXTO_ACCEDRA = `Accedra es una empresa argentina B2B de tecnología. Su producto foco es la FIRMA BIOMÉTRICA CON VALIDEZ LEGAL (firma electrónica con validación de identidad por biometría) para empresas: RR.HH., legales, bancos, aseguradoras, inmobiliarias. También hace networking, ciberseguridad, consultoría y software con IA, pero lo que se empuja es la firma biométrica.
Clientes de referencia: Mapfre, Andreani, Finning. Partners: Cisco, Microsoft.
El público son decisores de empresas medianas y grandes en Argentina, no personas sueltas.

Dos cosas que NUNCA hay que proponer:
- Conectividad satelital, Starlink o SD-WAN como servicio: Accedra no lo vende, aunque el sitio lo mencione.
- Trámites de gobierno de personas (GDE, "cómo crear mi firma digital", AFIP/ARCA para particulares, token de firma digital personal): es tráfico de gente que busca hacer un trámite, no de empresas que compran. Se comió el 58% del presupuesto de Ads.

Escribí en castellano rioplatense, claro y sin humo.`

/**
 * Le pide a Claude una respuesta con forma fija (JSON schema) y la devuelve ya
 * parseada. Mismo mecanismo que la revisión de notas: `output_config.format`.
 */
export async function pedir<T>(pedido: string, esquema: Record<string, unknown>): Promise<T> {
  const claude = crearClienteClaude()
  const respuesta = await claude.messages.create({
    model: MODELO,
    max_tokens: 12000,
    output_config: { effort: "medium", format: { type: "json_schema", schema: esquema } },
    system: CONTEXTO_ACCEDRA,
    messages: [{ role: "user", content: pedido }],
  })

  if (respuesta.stop_reason === "refusal") throw new Error("Claude no quiso procesar el pedido")
  const bloque = respuesta.content.find((b) => b.type === "text")
  if (!bloque || bloque.type !== "text") throw new Error("La respuesta llegó vacía")
  try {
    return JSON.parse(bloque.text) as T
  } catch {
    throw new Error(`La respuesta no es JSON: ${bloque.text.slice(0, 200)}`)
  }
}

/* ── Fechas ───────────────────────────────────────────────────────────────── */

/** "YYYY-MM-DD" de hoy en Argentina, menos `dias`. */
export function diaArgentina(dias = 0): string {
  const d = new Date(Date.now() - dias * 86_400_000)
  return d.toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" })
}

/**
 * La semana que se analiza (los 7 días hasta ayer) y la anterior, para
 * comparar. Hasta ayer y no hoy: el día en curso está incompleto en todas las
 * fuentes.
 */
export function semanas() {
  return {
    actual: { desde: diaArgentina(7), hasta: diaArgentina(1) },
    anterior: { desde: diaArgentina(14), hasta: diaArgentina(8) },
  }
}

/** Para el prompt: una tabla de objetos como líneas JSON, cortada. */
export function comoLineas(filas: unknown[], max = 60): string {
  if (filas.length === 0) return "(sin datos)"
  const lineas = filas.slice(0, max).map((f) => JSON.stringify(f))
  if (filas.length > max) lineas.push(`… y ${filas.length - max} más`)
  return lineas.join("\n")
}

/** Suma un campo numérico de una lista de filas, ignorando los nulos. */
export function sumar<T>(filas: T[], campo: keyof T): number {
  return filas.reduce((s, f) => s + (Number(f[campo]) || 0), 0)
}
