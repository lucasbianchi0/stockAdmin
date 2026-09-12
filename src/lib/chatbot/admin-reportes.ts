import type Anthropic from "@anthropic-ai/sdk"

import { supabase } from "@/lib/supabase"
import { redondear } from "@/lib/admin/moneda"
import { ideaDeFila } from "@/lib/banco-server"
import { CANAL_LABEL, type Canal } from "@/lib/calendario-context"
import type { Acceso, Modulo } from "@/lib/permisos"
import { citar } from "@/lib/chatbot/sanear"

/**
 * LA HERRAMIENTA QUE LEE — los números de la operación, a demanda.
 *
 * Herramienta y no contexto pegado en el prompt: las consultas son caras, casi
 * ninguna conversación las necesita y un número escrito al abrir el chat está
 * viejo tres mensajes después.
 *
 * Tres reglas que no se negocian:
 *
 *  1. Enum cerrado. El modelo elige una sección de esta lista y nada más; nunca
 *     arma una consulta. Corre con la service role, sin RLS debajo.
 *  2. Agregados, no personas. Cuántos, cuánto y el enlace a la pantalla. El
 *     nombre de un cliente con su saldo se ve en Reportes, donde lo mira quien
 *     tiene el permiso — no dictado por un chat que se puede equivocar de fila.
 *  3. No tira nunca. Un error de base vuelve como una frase que el asistente
 *     puede decir, no como una excepción que corta la respuesta a la mitad.
 *
 * Cada sección pertenece a un módulo, y la persona recibe sólo las de los
 * módulos que tiene: el enum mismo cambia según el acceso.
 */

export const SECCIONES = [
  "resumen",
  "por_cobrar",
  "por_pagar",
  "facturacion_mes",
  "pedidos",
  "contenido",
] as const
export type Seccion = (typeof SECCIONES)[number]

const MODULO_DE: Record<Exclude<Seccion, "resumen">, Modulo> = {
  por_cobrar: "administracion",
  por_pagar: "administracion",
  facturacion_mes: "administracion",
  pedidos: "productos",
  contenido: "marketing",
}

const DESCRIPCION: Record<Seccion, string> = {
  resumen: "todas las secciones de abajo juntas, para un pantallazo general",
  por_cobrar: "facturas de venta con saldo pendiente: total, vencido y lo que vence en 7 días",
  por_pagar: "facturas de compra con saldo pendiente: total, vencido y lo que vence en 7 días",
  facturacion_mes: "lo facturado y lo comprado en el mes en curso, por moneda",
  pedidos: "pedidos a Distecna de los últimos 30 días, por estado",
  contenido: "piezas programadas para los próximos 14 días y cuántas quedan en el banco",
}

export function esSeccion(v: unknown): v is Seccion {
  return typeof v === "string" && (SECCIONES as readonly string[]).includes(v)
}

export function seccionesPara(acceso: Acceso): Seccion[] {
  const propias = (Object.keys(MODULO_DE) as Exclude<Seccion, "resumen">[]).filter(
    (s) => acceso.admin || acceso.modulos.includes(MODULO_DE[s])
  )
  return propias.length > 0 ? ["resumen", ...propias] : []
}

export function herramientaPanel(secciones: Seccion[]): Anthropic.Beta.BetaTool {
  return {
    name: "datos_del_panel",
    description:
      "Trae números agregados y actuales de la operación de Accedra, leídos de la base en el momento. " +
      "Devuelve totales y el enlace a la pantalla donde está el detalle; nunca datos de un cliente, proveedor o persona puntual. " +
      `Secciones: ${secciones.map((s) => `${s} (${DESCRIPCION[s]})`).join("; ")}.`,
    input_schema: {
      type: "object",
      properties: { seccion: { type: "string", enum: [...secciones] } },
      required: ["seccion"],
      additionalProperties: false,
    },
    strict: true,
  }
}

/* ── Formato ──────────────────────────────────────────────────────────────── */

const ZONA = "America/Argentina/Buenos_Aires"

/** YYYY-MM-DD en Buenos Aires: `toISOString()` da UTC y después de las 21 ya es mañana. */
function hoyISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date())
}

function sumarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

const importe = (moneda: "ARS" | "USD", n: number) =>
  `${moneda === "ARS" ? "$" : "USD"} ${redondear(n).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

const fechaCorta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

type PorMoneda = { ARS: number; USD: number }
const cero = (): PorMoneda => ({ ARS: 0, USD: 0 })

function montos(m: PorMoneda): string {
  const partes = (["ARS", "USD"] as const).filter((k) => m[k] !== 0).map((k) => importe(k, m[k]))
  return partes.length ? partes.join(" y ") : "nada"
}

/* ── Secciones ────────────────────────────────────────────────────────────── */

/** Mismo criterio que el reporte de pendientes, para que los números coincidan con la pantalla. */
async function pendientes(tipo: "venta" | "compra"): Promise<string> {
  const TOPE = 2000
  const { data, error } = await supabase
    .from("comprobantes_vigentes")
    .select("moneda, saldo, fecha_vencimiento")
    .eq("tipo", tipo)
    .gt("saldo", 0)
    .limit(TOPE)
  if (error) throw error

  const hoy = hoyISO()
  const en7 = sumarDias(hoy, 7)
  const total = cero()
  const vencido = cero()
  const proximo = cero()
  let vencidas = 0
  let proximas = 0

  for (const f of data ?? []) {
    const moneda = f.moneda === "USD" ? "USD" : "ARS"
    const saldo = Number(f.saldo)
    const vence = f.fecha_vencimiento as string | null
    total[moneda] += saldo
    if (vence && vence < hoy) {
      vencido[moneda] += saldo
      vencidas++
    } else if (vence && vence <= en7) {
      proximo[moneda] += saldo
      proximas++
    }
  }

  const n = data?.length ?? 0
  const que = tipo === "venta" ? "Por cobrar" : "Por pagar"
  const lineas = [
    `${que} al ${fechaCorta(hoy)} (facturas confirmadas con saldo):`,
    `- ${n} facturas, ${montos(total)}.`,
    `- Vencidas: ${vencidas}, ${montos(vencido)}.`,
    `- Vencen en los próximos 7 días: ${proximas}, ${montos(proximo)}.`,
    "- Los importes van por moneda y no se suman entre sí.",
    `- Detalle por ${tipo === "venta" ? "cliente" : "proveedor"}: /admin/reportes`,
  ]
  if (n >= TOPE) lineas.push("- Ojo: se leyeron las primeras 2000; el total real es mayor.")
  return lineas.join("\n")
}

async function facturacionMes(): Promise<string> {
  const hoy = hoyISO()
  const desde = `${hoy.slice(0, 7)}-01`
  const { data, error } = await supabase
    .from("comprobantes_vigentes")
    .select("tipo, moneda, total, signo")
    .in("tipo", ["venta", "compra"])
    .gte("fecha", desde)
    .lte("fecha", hoy)
    .limit(5000)
  if (error) throw error

  const ventas = cero()
  const compras = cero()
  let nVentas = 0
  let nCompras = 0
  for (const f of data ?? []) {
    const moneda = f.moneda === "USD" ? "USD" : "ARS"
    const monto = Number(f.total) * (Number(f.signo) === -1 ? -1 : 1)
    if (f.tipo === "venta") {
      ventas[moneda] += monto
      nVentas++
    } else {
      compras[moneda] += monto
      nCompras++
    }
  }

  return [
    `Del ${fechaCorta(desde)} al ${fechaCorta(hoy)} (comprobantes confirmados, notas de crédito restando):`,
    `- Ventas: ${nVentas} comprobantes, ${montos(ventas)}.`,
    `- Compras: ${nCompras} comprobantes, ${montos(compras)}.`,
    "- Listados: /admin/ventas/listado y /admin/compras/listado",
  ].join("\n")
}

async function pedidos(): Promise<string> {
  const desde = new Date(Date.now() - 30 * 86400_000).toISOString()
  const { data, error } = await supabase
    .from("orders")
    .select("status, total_usd, created_at")
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(500)
  if (error) throw error

  const filas = data ?? []
  if (filas.length === 0) return "No hubo pedidos a Distecna en los últimos 30 días. Pantalla: /orders"

  const porEstado = new Map<string, { n: number; usd: number }>()
  for (const f of filas) {
    // El estado lo escribe el sistema, no una persona: va limpio y sin comillas
    // angulares, que el modelo repetiría tal cual en la respuesta.
    const estado = String(f.status ?? "sin estado").replace(/[^\w -]/g, "").slice(0, 30) || "sin estado"
    const acc = porEstado.get(estado) ?? { n: 0, usd: 0 }
    acc.n++
    acc.usd += Number(f.total_usd) || 0
    porEstado.set(estado, acc)
  }

  const ultimo = String(filas[0].created_at).slice(0, 10)
  return [
    `Pedidos a Distecna de los últimos 30 días: ${filas.length}.`,
    ...[...porEstado].map(([estado, v]) => `- ${estado}: ${v.n}, ${importe("USD", v.usd)}.`),
    `- El último es del ${fechaCorta(ultimo)}.`,
    "- Detalle: /orders",
  ].join("\n")
}

async function contenido(): Promise<string> {
  const hoy = hoyISO()
  const hasta = sumarDias(hoy, 14)
  const [programadas, banco] = await Promise.all([
    supabase
      .from("content_slots")
      .select("programada, canal, opciones")
      .eq("origen", "banco")
      .gte("programada", hoy)
      .lte("programada", hasta)
      .order("programada", { ascending: true })
      .limit(100),
    supabase
      .from("content_slots")
      .select("id", { count: "exact", head: true })
      .eq("origen", "banco")
      .is("programada", null),
  ])
  if (programadas.error) throw programadas.error
  if (banco.error) throw banco.error

  const filas = programadas.data ?? []
  const nombreCanal = (c: unknown) => CANAL_LABEL[c as Canal] ?? "otro canal"

  const lineas = [
    `Contenido programado del ${fechaCorta(hoy)} al ${fechaCorta(hasta)}: ${filas.length} piezas.`,
  ]
  for (const f of filas.slice(0, 8)) {
    const idea = ideaDeFila(f as Record<string, unknown>)
    const titular = idea?.headline || idea?.titulo || ""
    lineas.push(
      `- ${fechaCorta(String(f.programada))} · ${nombreCanal(f.canal)}${titular ? ` · ${citar(titular, 90)}` : ""}`
    )
  }
  if (filas.length > 8) lineas.push(`- …y ${filas.length - 8} más.`)
  lineas.push(
    `- En el banco, sin programar: ${banco.count ?? 0} piezas.`,
    "- Agenda: /contenido/agenda · Generación: /contenido/generacion"
  )
  return lineas.join("\n")
}

const LEER: Record<Exclude<Seccion, "resumen">, () => Promise<string>> = {
  por_cobrar: () => pendientes("venta"),
  por_pagar: () => pendientes("compra"),
  facturacion_mes: facturacionMes,
  pedidos,
  contenido,
}

const PANTALLA: Record<Exclude<Seccion, "resumen">, string> = {
  por_cobrar: "/admin/reportes",
  por_pagar: "/admin/reportes",
  facturacion_mes: "/admin/ventas/listado",
  pedidos: "/orders",
  contenido: "/contenido/agenda",
}

async function leerSeguro(seccion: Exclude<Seccion, "resumen">): Promise<string> {
  try {
    return await LEER[seccion]()
  } catch (e) {
    console.error("[chat datos_del_panel]", { seccion, error: (e as Error).message })
    return `No pude leer ${seccion.replace("_", " ")} ahora. Decile que lo mire en ${PANTALLA[seccion]}.`
  }
}

/**
 * La ejecución. Vuelve a chequear el acceso aunque la ruta ya lo filtró al
 * armar el enum: es redundante a propósito, y es lo que lee quien audite esto.
 */
export async function datosDelPanel(seccion: unknown, acceso: Acceso): Promise<string> {
  const permitidas = seccionesPara(acceso)
  if (!esSeccion(seccion) || !permitidas.includes(seccion)) {
    return "Esa sección no está disponible para el acceso de esta persona. Decile que no la podés consultar."
  }

  if (seccion !== "resumen") return leerSeguro(seccion)

  const todas = permitidas.filter((s): s is Exclude<Seccion, "resumen"> => s !== "resumen")
  const partes = await Promise.all(todas.map(leerSeguro))
  return partes.join("\n\n")
}
