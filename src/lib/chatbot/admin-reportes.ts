import type Anthropic from "@anthropic-ai/sdk"

import { supabase } from "@/lib/supabase"
import { redondear } from "@/lib/admin/moneda"
import { ideaDeFila } from "@/lib/banco-server"
import { CANAL_LABEL, type Canal } from "@/lib/calendario-context"
import { normalizeIva } from "@/lib/iva"
import { CATEGORIA_LABEL, MODALIDAD_LABEL, TIPO_LABEL } from "@/lib/marketing/eventos"
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
 *     Lo que sí se lista con nombre es de Accedra: sus cuentas, sus eventos y
 *     los productos de su catálogo.
 *     La única excepción son las secciones de `SOLO_ADMIN`: la ficha y los
 *     montos de cada cliente, proveedor y vendedor, para un administrador.
 *     Decisión de la dirección (13/9/2026): quien administra la empresa tiene
 *     que poder preguntarle todo al asistente y que le conteste.
 *  3. No tira nunca. Un error de base vuelve como una frase que el asistente
 *     puede decir, no como una excepción que corta la respuesta a la mitad.
 *
 * Cada sección pertenece a un módulo, y la persona recibe sólo las de los
 * módulos que tiene: el enum mismo cambia según el acceso. Además cada agente
 * recibe sólo las de su especialidad (ver `especialistas.ts`).
 */

export const SECCIONES = [
  "resumen",
  "por_cobrar",
  "por_pagar",
  "facturacion_mes",
  "pedidos",
  "contenido",
  "antiguedad_saldos",
  "evolucion_12_meses",
  "ventas_por_cliente_y_vendedor",
  "compras_por_proveedor",
  "caja_y_bancos",
  "eventos",
  "catalogo_propio",
] as const
export type Seccion = (typeof SECCIONES)[number]
type Concreta = Exclude<Seccion, "resumen">

/** Las que junta "resumen": las livianas. Las de análisis se piden de a una. */
const EN_RESUMEN: Concreta[] = ["por_cobrar", "por_pagar", "facturacion_mes", "pedidos", "contenido"]

/**
 * Las del asistente general. Además del día a día, lo que un administrador
 * pregunta sin pensar en agentes: cómo vienen las ventas y las compras, y
 * quiénes son los principales clientes, proveedores y vendedores. Las de
 * `SOLO_ADMIN` se caen solas para quien no lo es (ver `seccionesPara`).
 */
export const SECCIONES_ASISTENTE: Seccion[] = [
  "resumen",
  ...EN_RESUMEN,
  "evolucion_12_meses",
  "ventas_por_cliente_y_vendedor",
  "compras_por_proveedor",
]

/** Las únicas con nombre y montos de terceros. Sólo para administradores. */
const SOLO_ADMIN: readonly Seccion[] = ["ventas_por_cliente_y_vendedor", "compras_por_proveedor"]

const MODULO_DE: Record<Concreta, Modulo> = {
  por_cobrar: "administracion",
  por_pagar: "administracion",
  facturacion_mes: "administracion",
  antiguedad_saldos: "administracion",
  evolucion_12_meses: "administracion",
  ventas_por_cliente_y_vendedor: "administracion",
  compras_por_proveedor: "administracion",
  caja_y_bancos: "administracion",
  pedidos: "productos",
  catalogo_propio: "productos",
  contenido: "marketing",
  eventos: "marketing",
}

const DESCRIPCION: Record<Seccion, string> = {
  resumen: "cobros, pagos, facturación del mes, pedidos y contenido juntos, para un pantallazo general",
  por_cobrar: "facturas de venta con saldo pendiente: total, vencido y lo que vence en 7 días",
  por_pagar: "facturas de compra con saldo pendiente: total, vencido y lo que vence en 7 días",
  facturacion_mes: "lo facturado y lo comprado en el mes en curso, por moneda",
  antiguedad_saldos: "lo que nos deben y lo que debemos por tramo de antigüedad (a vencer, 1-30, 31-60, 61-90, más de 90 días), por moneda",
  evolucion_12_meses: "ventas y compras mes por mes de los últimos 12 meses, por moneda",
  ventas_por_cliente_y_vendedor:
    "ventas por cliente y por vendedor del equipo, con razón social o nombre, montos y participación: últimos 12 meses, mes en curso y todo lo cargado. Para '¿quién es nuestro principal cliente?' o '¿qué vendedor vende más?'",
  compras_por_proveedor:
    "compras por proveedor, con razón social, montos y participación: últimos 12 meses, mes en curso y todo lo cargado. Para '¿a quién le compramos más?' o '¿quién es nuestro principal proveedor?'",
  caja_y_bancos: "saldo actual de cada cuenta de caja, banco y billetera de Accedra, y el total por moneda",
  pedidos: "pedidos a Distecna de los últimos 30 días, por estado",
  catalogo_propio: "Nuestros Productos: cada producto con stock, costo, precio mínimo calculado, precio publicado, margen sobre el mínimo y semáforo",
  contenido: "piezas programadas para los próximos 14 días y cuántas quedan en el banco",
  eventos: "eventos de Accedra del último año y los próximos: tipo, modalidad, fecha, soluciones y asistentes registrados",
}

export function esSeccion(v: unknown): v is Seccion {
  return typeof v === "string" && (SECCIONES as readonly string[]).includes(v)
}

/** Las secciones que puede pedir esta persona; con `solo`, recortadas a esa lista. */
export function seccionesPara(acceso: Acceso, solo?: readonly Seccion[]): Seccion[] {
  const propias = (Object.keys(MODULO_DE) as Concreta[]).filter(
    (s) =>
      (acceso.admin || acceso.modulos.includes(MODULO_DE[s])) &&
      (acceso.admin || !SOLO_ADMIN.includes(s)) &&
      (!solo || solo.includes(s))
  )
  const conResumen =
    (!solo || solo.includes("resumen")) && propias.some((s) => EN_RESUMEN.includes(s))
  return conResumen ? ["resumen", ...propias] : propias
}

export function herramientaPanel(secciones: Seccion[]): Anthropic.Beta.BetaTool {
  const conNombres = secciones.some((s) => SOLO_ADMIN.includes(s))
  return {
    name: "datos_del_panel",
    description:
      "Trae números actuales de la operación de Accedra, leídos de la base en el momento. " +
      (conNombres
        ? "ventas_por_cliente_y_vendedor y compras_por_proveedor traen cada cliente, proveedor y vendedor con su ficha (razón social, CUIT, contacto, mail, teléfono, provincia) y sus montos, porque quien pregunta es administrador. El resto vuelve en agregados. "
        : "Devuelve agregados y el enlace a la pantalla donde está el detalle; nunca datos de un cliente, proveedor o persona puntual. ") +
      "Lo propio de Accedra —sus cuentas, sus eventos, los productos de su catálogo— sí viene con nombre. " +
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

const diasEntre = (desde: string, hasta: string) =>
  Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86400_000)

const importe = (moneda: "ARS" | "USD", n: number) =>
  `${moneda === "ARS" ? "$" : "USD"} ${redondear(n).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

const fechaCorta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

type PorMoneda = { ARS: number; USD: number }
const cero = (): PorMoneda => ({ ARS: 0, USD: 0 })
const monedaDe = (v: unknown): "ARS" | "USD" => (v === "USD" ? "USD" : "ARS")

function montos(m: PorMoneda): string {
  const partes = (["ARS", "USD"] as const).filter((k) => m[k] !== 0).map((k) => importe(k, m[k]))
  return partes.length ? partes.join(" y ") : "nada"
}

type Fila = Record<string, unknown>

/**
 * PostgREST corta en mil filas aunque el `limit` pida más. Para las secciones
 * que suman un año entero se lee por páginas, con un techo para no quedarse
 * leyendo si algo crece de golpe.
 */
async function leerPaginado(
  armar: (desde: number, hasta: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
  tope = 20000
): Promise<{ filas: Fila[]; cortado: boolean }> {
  const PAGINA = 1000
  const filas: Fila[] = []
  for (let desde = 0; desde < tope; desde += PAGINA) {
    const { data, error } = await armar(desde, desde + PAGINA - 1)
    if (error) throw new Error(error.message)
    const pagina = (data ?? []) as Fila[]
    filas.push(...pagina)
    if (pagina.length < PAGINA) return { filas, cortado: false }
  }
  return { filas, cortado: true }
}

/* ── Secciones ────────────────────────────────────────────────────────────── */

/** Mismo criterio que el reporte de pendientes, para que los números coincidan con la pantalla. */
async function pendientes(tipo: "venta" | "compra"): Promise<string> {
  const TOPE = 2000
  const { data, error } = await supabase
    .from("comprobantes_vigentes")
    .select("moneda, saldo, fecha_vencimiento, signo")
    .eq("tipo", tipo)
    .gt("saldo", 0)
    .limit(TOPE)
  if (error) throw error

  const hoy = hoyISO()
  const en7 = sumarDias(hoy, 7)
  const total = cero()
  const vencido = cero()
  const proximo = cero()
  let facturas = 0
  let notas = 0
  let vencidas = 0
  let proximas = 0

  for (const f of data ?? []) {
    const moneda = monedaDe(f.moneda)
    /**
     * Con signo, igual que `/admin/reportes` y que la ficha del cliente: una
     * nota de crédito sin aplicar no es plata a cobrar, es crédito a favor del
     * cliente. Sumándola, el "por cobrar" del chatbot decía un número más alto
     * que la pantalla que dice copiar.
     */
    const signo = Number(f.signo) === -1 ? -1 : 1
    const saldo = Number(f.saldo) * signo
    const vence = f.fecha_vencimiento as string | null
    total[moneda] += saldo
    if (signo === -1) {
      notas++
      continue
    }
    facturas++
    // Una nota de crédito no vence ni se reclama, así que no entra en estos dos
    // contadores: baja el total y nada más.
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
    `- ${facturas} facturas, ${montos(total)}.`,
    `- Vencidas: ${vencidas}, ${montos(vencido)}.`,
    `- Vencen en los próximos 7 días: ${proximas}, ${montos(proximo)}.`,
    "- Los importes van por moneda y no se suman entre sí.",
    `- Detalle por ${tipo === "venta" ? "cliente" : "proveedor"}: /admin/reportes`,
  ]
  if (notas > 0) {
    lineas.push(
      `- El total ya viene neto de ${notas} nota${notas === 1 ? "" : "s"} de crédito sin aplicar.`
    )
  }
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
    const moneda = monedaDe(f.moneda)
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

const TRAMOS = [
  { id: "a_vencer", nombre: "A vencer" },
  { id: "d1_30", nombre: "Vencido de 1 a 30 días" },
  { id: "d31_60", nombre: "Vencido de 31 a 60 días" },
  { id: "d61_90", nombre: "Vencido de 61 a 90 días" },
  { id: "d90", nombre: "Vencido hace más de 90 días" },
  { id: "sin_fecha", nombre: "Sin fecha de vencimiento" },
] as const

function tramoDe(vence: string | null, hoy: string): (typeof TRAMOS)[number]["id"] {
  if (!vence) return "sin_fecha"
  const atraso = diasEntre(vence, hoy)
  if (atraso <= 0) return "a_vencer"
  if (atraso <= 30) return "d1_30"
  if (atraso <= 60) return "d31_60"
  if (atraso <= 90) return "d61_90"
  return "d90"
}

async function antiguedadSaldos(): Promise<string> {
  const { filas, cortado } = await leerPaginado((desde, hasta) =>
    supabase
      .from("comprobantes_vigentes")
      .select("tipo, moneda, saldo, fecha_vencimiento, signo")
      .in("tipo", ["venta", "compra"])
      .gt("saldo", 0)
      .range(desde, hasta)
  )
  const hoy = hoyISO()

  const bloques = (["venta", "compra"] as const).map((tipo) => {
    const acc = new Map(TRAMOS.map((t) => [t.id, { n: 0, m: cero() }]))
    const total = cero()
    const notas = cero()
    let n = 0
    let nNotas = 0
    for (const f of filas) {
      if (f.tipo !== tipo) continue
      const moneda = monedaDe(f.moneda)
      const saldo = Number(f.saldo) || 0

      /**
       * Las notas de crédito no entran en ningún tramo: van aparte.
       *
       * Meterlas adentro —aunque sea restando— hacía que este reporte dijera
       * "6 facturas vencidas de 1 a 30 días" mientras la pantalla de reportes y
       * el asistente decían 5, porque allá la nota no vence. Tres lugares
       * contestando distinto la misma pregunta es peor que cualquiera de las
       * tres respuestas.
       *
       * Una nota no tiene antigüedad que medir: no se reclama, se aplica. Por
       * eso baja el total —es plata que no vamos a cobrar— pero no ensucia los
       * tramos, que son la lista de a quién llamar.
       */
      if (Number(f.signo) === -1) {
        nNotas++
        notas[moneda] += saldo
        total[moneda] -= saldo
        continue
      }

      const tramo = acc.get(tramoDe((f.fecha_vencimiento as string | null) ?? null, hoy))!
      tramo.n++
      tramo.m[moneda] += saldo
      total[moneda] += saldo
      n++
    }

    const proporcion = (m: PorMoneda) =>
      (["ARS", "USD"] as const)
        .filter((k) => total[k] > 0 && m[k] !== 0)
        .map(
          (k) =>
            `${Math.round((m[k] / (total[k] + notas[k] || 1)) * 100)}% de lo facturado en ` +
            `${k === "ARS" ? "pesos" : "dólares"}`
        )
        .join(", ")

    return [
      `${tipo === "venta" ? "Lo que nos deben (facturas de venta)" : "Lo que debemos (facturas de compra)"}: ${n} facturas, ${montos(total)}.`,
      ...TRAMOS.map((t) => {
        const v = acc.get(t.id)!
        if (v.n === 0) return `- ${t.nombre}: nada.`
        return `- ${t.nombre}: ${v.n} facturas, ${montos(v.m)} (${proporcion(v.m)}).`
      }),
      ...(nNotas > 0
        ? [
            `- Aparte, ${nNotas} nota${nNotas === 1 ? "" : "s"} de crédito sin aplicar por ` +
              `${montos(notas)}, que ya está${nNotas === 1 ? "" : "n"} descontada${nNotas === 1 ? "" : "s"} ` +
              `del total y no entra${nNotas === 1 ? "" : "n"} en ningún tramo: no vencen, se aplican.`,
          ]
        : []),
    ].join("\n")
  })

  return [
    `Antigüedad de saldos al ${fechaCorta(hoy)}, contada desde el vencimiento de cada factura:`,
    ...bloques,
    "- Importes por moneda, sin sumarse entre sí.",
    "- Detalle por cliente y proveedor: /admin/reportes",
    ...(cortado ? ["- Ojo: se leyó hasta el tope de filas; el total real es mayor."] : []),
  ].join("\n\n")
}

async function evolucion12Meses(): Promise<string> {
  const hoy = hoyISO()
  const [anio, mes] = hoy.split("-").map(Number)
  const inicio = new Date(Date.UTC(anio, mes - 1 - 11, 1)).toISOString().slice(0, 10)

  const { filas, cortado } = await leerPaginado((desde, hasta) =>
    supabase
      .from("comprobantes_vigentes")
      .select("tipo, moneda, total, signo, fecha")
      .in("tipo", ["venta", "compra"])
      .gte("fecha", inicio)
      .lte("fecha", hoy)
      .range(desde, hasta)
  )

  const meses = Array.from({ length: 12 }, (_, i) =>
    new Date(Date.UTC(anio, mes - 1 - 11 + i, 1)).toISOString().slice(0, 7)
  )
  const acc = new Map(meses.map((m) => [m, { ventas: cero(), compras: cero(), nV: 0, nC: 0 }]))

  for (const f of filas) {
    const v = acc.get(String(f.fecha).slice(0, 7))
    if (!v) continue
    const moneda = monedaDe(f.moneda)
    const monto = Number(f.total) * (Number(f.signo) === -1 ? -1 : 1)
    if (f.tipo === "venta") {
      v.ventas[moneda] += monto
      v.nV++
    } else {
      v.compras[moneda] += monto
      v.nC++
    }
  }

  return [
    `Ventas y compras por mes, de ${meses[0].slice(5)}/${meses[0].slice(0, 4)} a hoy (comprobantes confirmados, notas de crédito restando):`,
    ...meses.map((m) => {
      const v = acc.get(m)!
      const parcial = m === hoy.slice(0, 7) ? " (mes en curso, parcial)" : ""
      return `- ${m.slice(5)}/${m.slice(0, 4)}${parcial}: ventas ${montos(v.ventas)} en ${v.nV} comprobantes · compras ${montos(v.compras)} en ${v.nC} comprobantes.`
    }),
    "- Los montos en pesos no están ajustados por inflación: más allá de tres meses, compará proporciones y no montos.",
    "- Ventas menos compras no es el margen: las compras incluyen gastos y bienes que no se vendieron en el mismo mes.",
    "- Listados: /admin/ventas/listado y /admin/compras/listado",
    ...(cortado ? ["- Ojo: se leyó hasta el tope de filas; faltan comprobantes."] : []),
  ].join("\n")
}

type Acumulado = { n: number; m: PorMoneda; ars: number }
type Ventana = "doce" | "mes" | "todo"
const nuevoAcumulado = (): Acumulado => ({ n: 0, m: cero(), ars: 0 })
const porVentana = (): Record<Ventana, Acumulado> => ({ doce: nuevoAcumulado(), mes: nuevoAcumulado(), todo: nuevoAcumulado() })

/**
 * La ficha de cada uno en un renglón: nombre y, si están cargados, CUIT,
 * contacto, mail, teléfono y provincia. Todo lo tipeó una persona, así que va
 * citado.
 */
async function nombresDe(
  tabla: "clientes" | "proveedores" | "vendedores",
  ids: string[]
): Promise<Map<string, string>> {
  const columnas = tabla === "vendedores" ? "id, nombre, email" : "id, razon_social, cuit, contacto, email, telefono, provincia"
  const mapa = new Map<string, string>()
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase.from(tabla).select(columnas).in("id", ids.slice(i, i + 200))
    if (error) throw new Error(error.message)
    for (const f of (data ?? []) as unknown as Fila[]) {
      const nombre = citar(String(f.razon_social ?? f.nombre ?? "") || "sin nombre cargado", 80)
      const extra = [
        f.cuit ? `CUIT ${String(f.cuit).replace(/\D/g, "")}` : "",
        f.contacto ? `contacto ${citar(String(f.contacto), 60)}` : "",
        f.email ? citar(String(f.email), 80) : "",
        f.telefono ? `tel. ${citar(String(f.telefono), 30)}` : "",
        f.provincia ? citar(String(f.provincia), 30) : "",
      ].filter(Boolean)
      mapa.set(String(f.id), extra.length ? `${nombre} (${extra.join(", ")})` : nombre)
    }
  }
  return mapa
}

/**
 * Ventas por cliente y por vendedor, o compras por proveedor. Sólo llega a un
 * administrador (ver `SOLO_ADMIN`).
 *
 * Se ordena por el equivalente en pesos al tipo de cambio de cada factura
 * (`total_ars`), porque un ranking que no compara pesos con dólares no puede
 * decir quién es el principal. Los montos se muestran igual en su moneda, que
 * es lo que coincide con la pantalla.
 */
async function porEntidad(tipo: "venta" | "compra"): Promise<string> {
  const { filas, cortado } = await leerPaginado((desde, hasta) =>
    supabase
      .from("comprobantes_vigentes")
      .select("cliente_id, proveedor_id, vendedor_id, moneda, total, total_ars, signo, fecha")
      .eq("tipo", tipo)
      .order("fecha", { ascending: true })
      .range(desde, hasta)
  )

  const que = tipo === "venta" ? "ventas" : "compras"
  if (filas.length === 0) return `No hay facturas de ${que} confirmadas. Pantalla: /admin/${que}/listado`

  const hoy = hoyISO()
  const [anio, mes] = hoy.split("-").map(Number)
  const inicio12 = new Date(Date.UTC(anio, mes - 1 - 11, 1)).toISOString().slice(0, 10)
  const ventanas: { id: Ventana; nombre: string; desde: string }[] = [
    { id: "doce", nombre: `Últimos 12 meses (desde el ${fechaCorta(inicio12)}/${inicio12.slice(0, 4)})`, desde: inicio12 },
    { id: "mes", nombre: "Mes en curso", desde: `${hoy.slice(0, 7)}-01` },
    { id: "todo", nombre: "Todo lo cargado", desde: "" },
  ]

  const agrupar = (clave: string) => {
    const porId = new Map<string, Record<Ventana, Acumulado>>()
    const total = porVentana()
    for (const f of filas) {
      const id = f[clave] ? String(f[clave]) : ""
      const signo = Number(f.signo) === -1 ? -1 : 1
      const moneda = monedaDe(f.moneda)
      const monto = (Number(f.total) || 0) * signo
      const ars = (Number(f.total_ars) || 0) * signo
      const fecha = String(f.fecha)
      const acc = porId.get(id) ?? porVentana()
      for (const v of ventanas) {
        if (fecha < v.desde || (v.id !== "todo" && fecha > hoy)) continue
        for (const a of [acc[v.id], total[v.id]]) {
          a.n++
          a.m[moneda] += monto
          a.ars += ars
        }
      }
      porId.set(id, acc)
    }
    return { porId, total }
  }

  const tramo = (a: Acumulado, t: Acumulado) => {
    if (a.n === 0) return "nada"
    const parte = t.ars > 0 ? ` (${Math.round((a.ars / t.ars) * 100)}%)` : ""
    return `${montos(a.m)} en ${a.n} ${a.n === 1 ? "factura" : "facturas"}${parte}`
  }

  const TOPE = 10
  const ranking = (titulo: string, grupo: ReturnType<typeof agrupar>, nombres: Map<string, string>, sinId: string) => {
    const orden = [...grupo.porId].sort(([, a], [, b]) => b.doce.ars - a.doce.ars || b.todo.ars - a.todo.ars)
    return [
      `${titulo}: ${grupo.porId.size}, ordenados por lo de los últimos 12 meses.`,
      ...orden.slice(0, TOPE).map(
        ([id, a], i) =>
          `${i + 1}. ${id ? nombres.get(id) || "sin ficha" : sinId} · 12 meses: ${tramo(a.doce, grupo.total.doce)} · mes en curso: ${tramo(a.mes, grupo.total.mes)} · todo lo cargado: ${tramo(a.todo, grupo.total.todo)}`
      ),
      ...(orden.length > TOPE ? [`- …y ${orden.length - TOPE} más.`] : []),
    ].join("\n")
  }

  const campo = tipo === "venta" ? "cliente_id" : "proveedor_id"
  const idsDe = (clave: string) => [...new Set(filas.map((f) => f[clave]).filter(Boolean).map(String))]
  const [entidades, vendedores] = await Promise.all([
    nombresDe(tipo === "venta" ? "clientes" : "proveedores", idsDe(campo)),
    tipo === "venta" ? nombresDe("vendedores", idsDe("vendedor_id")) : Promise.resolve(new Map<string, string>()),
  ])

  const principal = agrupar(campo)
  const partes = [
    [
      `${tipo === "venta" ? "Ventas" : "Compras"} confirmadas al ${fechaCorta(hoy)}, con las notas de crédito restando:`,
      ...ventanas.map((v) => `- ${v.nombre}: ${montos(principal.total[v.id].m)} en ${principal.total[v.id].n} comprobantes.`),
      "- Los porcentajes comparan el equivalente en pesos al tipo de cambio de cada factura. Los montos van en su moneda y no se suman entre sí.",
    ].join("\n"),
    ranking(tipo === "venta" ? "Clientes" : "Proveedores", principal, entidades, tipo === "venta" ? "sin cliente" : "sin proveedor"),
  ]
  if (tipo === "venta") {
    partes.push(
      ranking("Vendedores del equipo (el asignado en cada factura de venta)", agrupar("vendedor_id"), vendedores, "sin vendedor asignado")
    )
  }
  partes.push(
    `- Detalle: /admin/${que}/listado · cuenta corriente: /admin/${tipo === "venta" ? "clientes" : "proveedores"}/cuenta-corriente · reportes: /admin/reportes`,
    ...(cortado ? ["- Ojo: se leyó hasta el tope de filas; faltan comprobantes."] : [])
  )
  return partes.join("\n\n")
}

async function cajaYBancos(): Promise<string> {
  const { data, error } = await supabase
    .from("cuentas_saldo")
    .select("nombre, tipo, moneda, saldo")
    .eq("activo", true)
    .order("orden", { ascending: true })
    .limit(100)
  if (error) throw error

  const filas = data ?? []
  if (filas.length === 0) return "No hay cuentas activas cargadas. Pantalla: /admin/cuentas"

  const total = cero()
  const lineas = filas.map((c) => {
    const moneda = monedaDe(c.moneda)
    const saldo = Number(c.saldo) || 0
    total[moneda] += saldo
    const tipo = String(c.tipo ?? "").replace(/[^\w -]/g, "").slice(0, 20)
    return `- ${citar(c.nombre as string, 60)}${tipo ? ` (${tipo})` : ""}: ${importe(moneda, saldo)}${saldo < 0 ? " — saldo negativo, a revisar" : ""}.`
  })

  return [
    `Saldos de caja, bancos y billeteras al ${fechaCorta(hoyISO())}, según los movimientos cargados:`,
    ...lineas,
    `- Total en pesos: ${importe("ARS", total.ARS)}. Total en dólares: ${importe("USD", total.USD)}.`,
    "- Un saldo sólo es real si la cuenta está conciliada con el extracto. Pantalla: /admin/cuentas",
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

/** El dólar oficial venta, el mismo que usa la pantalla de Nuestros Productos. */
async function dolarOficial(): Promise<number | null> {
  try {
    const res = await fetch("https://dolarapi.com/v1/dolares/oficial", { next: { revalidate: 3600 } })
    if (!res.ok) return null
    const venta = Number((await res.json()).venta)
    return Number.isFinite(venta) && venta > 0 ? venta : null
  } catch {
    return null
  }
}

/** La misma cuenta que la tabla de Nuestros Productos: si cambia allá, cambia acá. */
const precioMinimo = (costo: number, dolar: number, margen: number, iva: number) =>
  costo * dolar * 1.155 * margen * (1 + normalizeIva(iva)) + 8000

async function catalogoPropio(): Promise<string> {
  const [mis, ajuste, dolar] = await Promise.all([
    supabase
      .from("my_products")
      .select("code, publication_name, published_price, publication_link")
      .order("added_at", { ascending: true })
      .limit(1000),
    supabase.from("settings").select("value").eq("key", "margen_accedra").maybeSingle(),
    dolarOficial(),
  ])
  if (mis.error) throw mis.error

  const propias = mis.data ?? []
  if (propias.length === 0) return "Nuestros Productos está vacío. Pantalla: /mis-productos"

  const codigos = propias.map((p) => p.code as string)
  const productos = new Map<string, Fila>()
  for (let i = 0; i < codigos.length; i += 200) {
    const { data, error } = await supabase
      .from("products")
      .select("code, name, brand, stock, price, currency, iva")
      .in("code", codigos.slice(i, i + 200))
    if (error) throw error
    for (const p of data ?? []) productos.set(p.code as string, p)
  }

  const margen = parseFloat(String(ajuste.data?.value ?? "1.30")) || 1.3
  const peso = { rojo: 0, amarillo: 1, verde: 2 } as const
  const cuenta = { verde: 0, amarillo: 0, rojo: 0, rojoPorPrecio: 0, sinStock: 0, sinLink: 0, sinPrecio: 0 }

  const filas = propias.map((r) => {
    const p = productos.get(r.code as string) ?? {}
    const stock = Number(p.stock) || 0
    const costo = Number(p.price) || 0
    const iva = Number(p.iva) || 0
    const publicado = r.published_price === null || r.published_price === undefined ? null : Number(r.published_price)
    const minimo = dolar ? precioMinimo(costo, dolar, margen, iva) : null

    let color: keyof typeof peso
    let causa: string
    if (publicado !== null && minimo !== null && publicado <= minimo) {
      color = "rojo"
      causa = "precio publicado igual o menor al mínimo"
      cuenta.rojoPorPrecio++
    } else if (stock >= 30) {
      color = "verde"
      causa = "stock de 30 o más"
    } else if (stock >= 10) {
      color = "amarillo"
      causa = `stock ${stock}, entre 10 y 29`
    } else {
      color = "rojo"
      causa = stock > 0 ? `stock ${stock}, entre 1 y 9` : "sin stock"
    }
    cuenta[color]++
    if (stock <= 0) cuenta.sinStock++
    if (!r.publication_link) cuenta.sinLink++
    if (publicado === null) cuenta.sinPrecio++

    const nombre = (p.name as string | null) ?? (r.publication_name as string | null) ?? (r.code as string)
    // Distecna la escribe "U$S": se normaliza para que no quede un "US" suelto.
    const moneda = /^A?R?\$$|ARS|PES/i.test(String(p.currency ?? "")) ? "ARS" : "USD"
    const sobreMinimo =
      publicado !== null && minimo ? ` (${Math.round((publicado / minimo - 1) * 100)}% sobre el mínimo)` : ""

    const linea = [
      `- ${citar(nombre, 70)}${p.brand ? ` · ${citar(p.brand as string, 30)}` : ""}`,
      `stock ${stock}`,
      `costo ${moneda} ${costo.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`,
      minimo !== null ? `mínimo ${importe("ARS", minimo)}` : "mínimo sin calcular",
      publicado !== null ? `publicado ${importe("ARS", publicado)}${sobreMinimo}` : "sin precio publicado",
      r.publication_link ? "con publicación" : "sin enlace de publicación",
      `semáforo ${color} (${causa})`,
    ].join(" · ")

    return { color, linea }
  })

  filas.sort((a, b) => peso[a.color] - peso[b.color])
  const TOPE = 60

  return [
    `Nuestros Productos: ${propias.length} productos.`,
    `- Semáforo: ${cuenta.verde} verdes, ${cuenta.amarillo} amarillos, ${cuenta.rojo} rojos (${cuenta.rojoPorPrecio} por precio, el resto por stock).`,
    `- Sin stock: ${cuenta.sinStock}. Sin precio publicado: ${cuenta.sinPrecio}. Sin enlace de publicación: ${cuenta.sinLink}.`,
    dolar
      ? `- Precio mínimo = ((costo × dólar oficial ${importe("ARS", dolar)}) × 1,155 × margen ${margen.toLocaleString("es-AR")} × (1 + IVA)) + $ 8.000 de envío.`
      : "- No pude leer el dólar oficial: el precio mínimo no está calculado y el semáforo sólo mira el stock.",
    "",
    `Por producto, los rojos primero${filas.length > TOPE ? ` (los primeros ${TOPE})` : ""}:`,
    ...filas.slice(0, TOPE).map((f) => f.linea),
    "",
    "- Detalle y edición: /mis-productos",
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

const etiqueta = (mapa: Record<string, string>, v: unknown) =>
  mapa[String(v)] ?? String(v ?? "").replace(/[^\w -]/g, "").slice(0, 20)

async function eventos(): Promise<string> {
  const hoy = hoyISO()
  const { data, error } = await supabase
    .from("eventos")
    .select("id, titulo, tipo, modalidad, inicio, publicado, cupo, categorias")
    .gte("inicio", `${sumarDias(hoy, -365)}T00:00:00Z`)
    .order("inicio", { ascending: false })
    .limit(40)
  if (error) throw error

  const filas = data ?? []
  if (filas.length === 0) return "No hay eventos cargados en el último año ni programados. Pantalla: /marketing/eventos"

  const { data: asistentes, error: errorAsistentes } = await supabase
    .from("evento_asistentes")
    .select("evento_id")
    .in("evento_id", filas.map((e) => e.id as string))
    .limit(10000)
  if (errorAsistentes) throw errorAsistentes

  const porEvento = new Map<string, number>()
  for (const a of asistentes ?? []) {
    porEvento.set(a.evento_id as string, (porEvento.get(a.evento_id as string) ?? 0) + 1)
  }

  let realizados = 0
  let proximos = 0
  let totalAsistentes = 0
  const porTipo = new Map<string, number>()

  const lineas = filas.map((e) => {
    const inicio = String(e.inicio)
    const futuro = inicio.slice(0, 10) >= hoy
    const n = porEvento.get(e.id as string) ?? 0
    if (futuro) proximos++
    else {
      realizados++
      totalAsistentes += n
    }
    const tipo = etiqueta(TIPO_LABEL, e.tipo)
    porTipo.set(tipo, (porTipo.get(tipo) ?? 0) + 1)
    const categorias = Array.isArray(e.categorias)
      ? e.categorias.map((c) => etiqueta(CATEGORIA_LABEL, c)).join(", ")
      : ""
    const cupo = Number(e.cupo) > 0 ? ` de ${Number(e.cupo)} de cupo` : ""
    return `- ${fechaCorta(inicio)}/${inicio.slice(0, 4)} · ${futuro ? "próximo" : "realizado"} · ${tipo} · ${etiqueta(MODALIDAD_LABEL, e.modalidad)} · ${citar(e.titulo as string, 90)}${categorias ? ` · ${categorias}` : ""} · ${n} asistentes registrados${cupo} · ${e.publicado ? "publicado en el sitio" : "sin publicar"}`
  })

  return [
    `Eventos de Accedra del último año y próximos: ${filas.length} (${realizados} realizados, ${proximos} próximos).`,
    `- Asistentes registrados en los realizados: ${totalAsistentes}${realizados ? `, ${Math.round(totalAsistentes / realizados)} por evento en promedio` : ""}.`,
    `- Por tipo: ${[...porTipo].map(([t, n]) => `${t} ${n}`).join(", ")}.`,
    "- Los asistentes son los que se cargaron para emitir certificados: no hay registro de inscriptos que no fueron ni de oportunidades generadas por evento.",
    ...lineas,
    "- Pantalla: /marketing/eventos",
  ].join("\n")
}

const LEER: Record<Concreta, () => Promise<string>> = {
  por_cobrar: () => pendientes("venta"),
  por_pagar: () => pendientes("compra"),
  facturacion_mes: facturacionMes,
  antiguedad_saldos: antiguedadSaldos,
  evolucion_12_meses: evolucion12Meses,
  ventas_por_cliente_y_vendedor: () => porEntidad("venta"),
  compras_por_proveedor: () => porEntidad("compra"),
  caja_y_bancos: cajaYBancos,
  pedidos,
  catalogo_propio: catalogoPropio,
  contenido,
  eventos,
}

const PANTALLA: Record<Concreta, string> = {
  por_cobrar: "/admin/reportes",
  por_pagar: "/admin/reportes",
  facturacion_mes: "/admin/ventas/listado",
  antiguedad_saldos: "/admin/reportes",
  evolucion_12_meses: "/admin/ventas/listado",
  ventas_por_cliente_y_vendedor: "/admin/ventas/listado",
  compras_por_proveedor: "/admin/compras/listado",
  caja_y_bancos: "/admin/cuentas",
  pedidos: "/orders",
  catalogo_propio: "/mis-productos",
  contenido: "/contenido/agenda",
  eventos: "/marketing/eventos",
}

async function leerSeguro(seccion: Concreta): Promise<string> {
  try {
    return await LEER[seccion]()
  } catch (e) {
    console.error("[chat datos_del_panel]", { seccion, error: (e as Error).message })
    return `No pude leer ${seccion.replaceAll("_", " ")} ahora. Decile que lo mire en ${PANTALLA[seccion]}.`
  }
}

/**
 * La ejecución. Vuelve a chequear el acceso aunque la ruta ya lo filtró al
 * armar el enum: es redundante a propósito, y es lo que lee quien audite esto.
 */
export async function datosDelPanel(
  seccion: unknown,
  acceso: Acceso,
  solo?: readonly Seccion[]
): Promise<string> {
  const permitidas = seccionesPara(acceso, solo)
  if (!esSeccion(seccion) || !permitidas.includes(seccion)) {
    return "Esa sección no está disponible para el acceso de esta persona. Decile que no la podés consultar."
  }

  if (seccion !== "resumen") return leerSeguro(seccion)

  const todas = permitidas.filter((s): s is Concreta => s !== "resumen" && EN_RESUMEN.includes(s as Concreta))
  const partes = await Promise.all(todas.map(leerSeguro))
  return partes.join("\n\n")
}
