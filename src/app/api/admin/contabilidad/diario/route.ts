import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { ruta } from "@/lib/admin/ruta"
import { redondear } from "@/lib/admin/moneda"
import type { Asiento, LineaAsiento, OrigenAsiento } from "@/lib/admin/asientos"
import { numeracionPorEjercicio } from "@/lib/admin/ejercicios-server"

/**
 * Libro diario: los asientos del período, cada uno con sus líneas.
 *
 * La consulta trae **líneas** y las agrupa acá en asientos. Podría hacerse al
 * revés —traer asientos y pedir sus líneas— pero eso son dos viajes y un N+1
 * cuando la página muestra cincuenta asientos.
 *
 * El nombre del auxiliar (qué cliente, qué proveedor) se resuelve en una segunda
 * consulta por lote en vez de un join por línea: son dos consultas fijas, no una
 * por asiento.
 */

/** Un asiento rara vez pasa de diez líneas, así que esto son ~200 asientos. */
const TOPE = 2000

/**
 * `?completo=1` es para bajar el libro (Excel y la hoja para imprimir): trae
 * todo el período en páginas, del más viejo al más nuevo, que es el orden del
 * libro. La pantalla sigue con los más recientes y el tope: es para mirar.
 */
const PAGINA = 1000
const TOPE_COMPLETO = 100_000

export const GET = ruta("diario GET", async (req: Request) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso

  const url = new URL(req.url)
  const desde = url.searchParams.get("desde") ?? ""
  const hasta = url.searchParams.get("hasta") ?? ""
  const origen = url.searchParams.get("origen") ?? ""
  const cuenta = url.searchParams.get("cuenta") ?? ""
  const completo = url.searchParams.get("completo") === "1"

  const consulta = () => {
    let query = supabase
      .from("libro_diario")
      .select(
        `asiento_id, fecha, ejercicio, numero, origen, origen_id, descripcion,
         linea_id, orden, detalle, debe, haber, debe_ars, haber_ars, moneda, tc,
         auxiliar_tipo, auxiliar_id,
         cuenta_id, cuenta_codigo, cuenta_nombre, cuenta_tipo`
      )
    if (desde) query = query.gte("fecha", desde)
    if (hasta) query = query.lte("fecha", hasta)
    if (origen) query = query.eq("origen", origen)
    if (cuenta) query = query.eq("cuenta_id", cuenta)
    return query
  }

  type FilaDiario = NonNullable<Awaited<ReturnType<typeof consulta>>["data"]>[number]
  const filas: FilaDiario[] = []
  let truncado = false

  /*
   * Siempre en páginas: Supabase devuelve como mucho mil filas por pedido, y
   * un `.limit(2000)` volvía mil sin avisar. La pantalla mostraba 410 de 461
   * asientos del ejercicio y decía que estaban todos.
   *
   * La pantalla va del más nuevo al más viejo y corta en TOPE líneas; el libro
   * completo, del más viejo al más nuevo. El orden llega hasta la línea para
   * que las páginas no se pisen ni dejen huecos.
   */
  const tope = completo ? TOPE_COMPLETO : TOPE
  const asc = completo
  /*
   * Al bajar el libro las páginas se piden de a cuatro a la vez: un ejercicio
   * entero son varias páginas, y una detrás de la otra la descarga tardaba un
   * viaje a la base por cada mil líneas. Se recorren en orden y se corta en la
   * primera incompleta, así el resultado es el mismo que pidiéndolas en fila
   * (a lo sumo se piden de más unas páginas vacías al final). La pantalla
   * sigue de a una: casi siempre le alcanza con la primera.
   */
  const ola = completo ? 4 : 1
  paginas: for (let inicio = 0; ; inicio += ola * PAGINA) {
    const desdes: number[] = []
    for (let k = 0; k < ola && inicio + k * PAGINA < tope; k++) desdes.push(inicio + k * PAGINA)
    const respuestas = await Promise.all(
      desdes.map((d) =>
        consulta()
          .order("fecha", { ascending: asc })
          .order("numero", { ascending: asc })
          .order("asiento_id", { ascending: asc })
          .order("orden", { ascending: true })
          .order("linea_id", { ascending: true })
          .range(d, Math.min(d + PAGINA, tope) - 1)
      )
    )
    for (const [k, { data, error }] of respuestas.entries()) {
      if (error) {
        console.error("[diario]", error)
        return NextResponse.json({ error: "No se pudo cargar el libro diario" }, { status: 500 })
      }
      filas.push(...(data ?? []))
      if (!data || data.length < Math.min(PAGINA, tope - desdes[k])) break paginas
      if (filas.length >= tope) {
        truncado = true
        break paginas
      }
    }
  }

  // Cortado, el último asiento puede haber quedado con la mitad de sus líneas:
  // se saca entero antes que mostrarlo descuadrado.
  if (truncado && filas.length) {
    const ultimo = filas[filas.length - 1].asiento_id
    while (filas.length && filas[filas.length - 1].asiento_id === ultimo) filas.pop()
  }

  /* ── Los nombres de los auxiliares, en dos consultas ──────────────────── */

  const idsCliente = [
    ...new Set(filas.filter((f) => f.auxiliar_tipo === "cliente" && f.auxiliar_id).map((f) => f.auxiliar_id as string)),
  ]
  const idsProveedor = [
    ...new Set(filas.filter((f) => f.auxiliar_tipo === "proveedor" && f.auxiliar_id).map((f) => f.auxiliar_id as string)),
  ]

  /*
   * Los nombres, la numeración por ejercicio y (al bajar el libro) de qué lado
   * está cada comprobante salen todos de las líneas, no uno del otro: van a la
   * vez.
   */
  const idsComprobante = completo
    ? [
        ...new Set(
          filas.filter((f) => f.origen === "comprobante" && f.origen_id).map((f) => f.origen_id as string)
        ),
      ]
    : []
  const nombres = new Map<string, string>()
  const [, , numeracion, tiposLeidos] = await Promise.all([
    idsCliente.length
      ? supabase
          .from("clientes")
          .select("id, razon_social")
          .in("id", idsCliente)
          .then(({ data }) => data?.forEach((c) => nombres.set(c.id as string, c.razon_social as string)))
      : null,
    idsProveedor.length
      ? supabase
          .from("proveedores")
          .select("id, razon_social")
          .in("id", idsProveedor)
          .then(({ data }) => data?.forEach((p) => nombres.set(p.id as string, p.razon_social as string)))
      : null,
    // El número que se muestra es el del ejercicio 1/9–31/8 (ver ejercicios-server).
    numeracionPorEjercicio(filas.map((f) => f.asiento_id as string)),
    leerTiposDeComprobante(idsComprobante),
  ])
  if (tiposLeidos.error) {
    console.error("[diario] tipos de comprobante", tiposLeidos.error)
    return NextResponse.json({ error: "No se pudo cargar el libro diario" }, { status: 500 })
  }

  /* ── De líneas sueltas a asientos ─────────────────────────────────────── */

  const porAsiento = new Map<string, Asiento>()

  for (const f of filas) {
    const id = f.asiento_id as string
    let asiento = porAsiento.get(id)

    if (!asiento) {
      asiento = {
        id,
        fecha: f.fecha as string,
        ejercicio: Number(f.ejercicio),
        numero: Number(f.numero),
        origen: f.origen as OrigenAsiento,
        origenId: (f.origen_id as string | null) ?? null,
        descripcion: f.descripcion as string,
        lineas: [],
        totalArs: 0,
      }
      porAsiento.set(id, asiento)
    }

    const linea: LineaAsiento = {
      id: f.linea_id as string,
      orden: Number(f.orden),
      cuentaId: f.cuenta_id as string,
      cuentaCodigo: f.cuenta_codigo as string,
      cuentaNombre: f.cuenta_nombre as string,
      cuentaTipo: f.cuenta_tipo as LineaAsiento["cuentaTipo"],
      debe: Number(f.debe),
      haber: Number(f.haber),
      debeArs: Number(f.debe_ars),
      haberArs: Number(f.haber_ars),
      moneda: f.moneda as "ARS" | "USD",
      tc: Number(f.tc),
      detalle: (f.detalle as string | null) ?? null,
      auxiliarTipo: (f.auxiliar_tipo as LineaAsiento["auxiliarTipo"]) ?? null,
      auxiliarId: (f.auxiliar_id as string | null) ?? null,
      auxiliarNombre: f.auxiliar_id ? (nombres.get(f.auxiliar_id as string) ?? null) : null,
    }

    asiento.lineas.push(linea)
    asiento.totalArs = redondear(asiento.totalArs + linea.debeArs)
  }

  const asientos = [...porAsiento.values()]

  for (const a of asientos) {
    const n = numeracion.get(a.id)
    if (n) {
      a.numero = n.numero
      a.ejercicioNombre = n.ejercicio
    }
  }

  /*
   * El libro para el estudio resume las facturas en un asiento de IVA Compras y
   * otro de IVA Ventas por mes, así que necesita saber de qué lado está cada
   * comprobante. Sólo hace falta al bajar el libro, no en la pantalla.
   */
  if (completo) {
    const tipos = tiposLeidos.tipos
    for (const a of asientos) {
      const tipo = a.origenId ? tipos.get(a.origenId) : undefined
      if (a.origen === "comprobante" && tipo) a.comprobanteTipo = tipo
    }
  }

  return NextResponse.json({
    asientos,
    truncado,
    cantidad: asientos.length,
  })
})

/**
 * Compra o venta de cada comprobante, en lotes de 300 pedidos a la vez.
 * Devuelve el error en vez de tirarlo para que la ruta conteste lo mismo que
 * cuando esto se leía en fila.
 */
async function leerTiposDeComprobante(
  ids: string[]
): Promise<{ tipos: Map<string, "compra" | "venta">; error: unknown }> {
  const tipos = new Map<string, "compra" | "venta">()
  const respuestas = await Promise.all(
    Array.from({ length: Math.ceil(ids.length / 300) }, (_, k) =>
      supabase
        .from("comprobantes")
        .select("id, tipo")
        .in("id", ids.slice(k * 300, k * 300 + 300))
    )
  )
  for (const { data, error } of respuestas) {
    if (error) return { tipos, error }
    data?.forEach((c) => tipos.set(c.id as string, c.tipo as "compra" | "venta"))
  }
  return { tipos, error: null }
}
