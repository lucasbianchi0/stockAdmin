import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { ruta } from "@/lib/admin/ruta"
import { redondear } from "@/lib/admin/moneda"

/**
 * Pendientes de cobro o de pago: el reporte operativo que más se mira.
 *
 * A diferencia del listado de facturas, acá **no hay paginación**: el reporte es
 * el conjunto completo, porque su producto son los totales. Un total de la
 * página visible no sirve para nada — la pregunta es cuánto hay para cobrar en
 * total, no cuánto suman las primeras veinticinco.
 *
 * Los totales van separados por moneda y no consolidados. Sumar dólares y pesos
 * en un número único obliga a elegir un TC (¿el de cada factura? ¿el de hoy?) y
 * cualquiera de las dos respuestas engaña según para qué se mire.
 */

const TOPE = 2000

export const GET = ruta("reportes pendientes", async (req: Request) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso

  const url = new URL(req.url)
  const tipo = url.searchParams.get("tipo") === "compra" ? "compra" : "venta"
  const esVenta = tipo === "venta"

  /*
   * Las tres lecturas del reporte —los comprobantes con saldo, los pagos a
   * cuenta sin aplicar y la cotización de hoy— no dependen una de otra: van a
   * la vez y el reporte tarda lo que la más lenta, no la suma de las tres. Lo
   * que explica cada una está más abajo, donde se usa.
   */
  const [{ data, error }, { ordenes, pagoDe }, { data: cot }] = await Promise.all([
    supabase
      .from("comprobantes_vigentes")
      .select(
        `id, clase, punto_venta, numero, fecha, fecha_vencimiento, fecha_estimada_pago,
         moneda, tc, total, imputado, saldo, detalle, signo,
         iva, percepcion_iva, percepcion_iibb_bsas, percepcion_iibb_caba, otros_impuestos,
         cliente:clientes (id, razon_social),
         proveedor:proveedores (id, razon_social)`
      )
      .eq("tipo", tipo)
      .gt("saldo", 0)
      .order("fecha_vencimiento", { ascending: true, nullsFirst: false })
      .order("fecha", { ascending: true })
      .limit(TOPE),
    ordenesACuenta(esVenta),
    supabase
      .from("cotizaciones")
      .select("venta, fecha, created_at")
      .order("fecha", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (error) {
    console.error("[reportes pendientes]", error)
    return NextResponse.json({ error: "No se pudo armar el reporte" }, { status: 500 })
  }

  const hoy = new Date().toISOString().slice(0, 10)

  const filas: Array<Record<string, unknown> & { saldoArs: number; vencida: boolean }> = (data ?? []).map((f) => {
    const cliente = f.cliente as unknown as { id: string; razon_social: string } | null
    const proveedor = f.proveedor as unknown as { id: string; razon_social: string } | null
    const tc = f.tc === null ? null : Number(f.tc)
    const moneda = f.moneda as "ARS" | "USD"
    /**
     * Con signo, igual que en la ficha del cliente: una nota de crédito sin
     * aplicar no es algo que el cliente deba, es crédito a su favor. Sumándola
     * como una factura más, el "pendiente de cobro" decía que hay que cobrar
     * plata que en realidad hay que devolver o descontar.
     */
    const signo = Number(f.signo) === -1 ? -1 : 1
    const saldo = redondear(Number(f.saldo) * signo)

    /*
     * La fila, abierta como la planilla que este reporte viene a reemplazar:
     * neto, impuestos, total, y el total valuado en pesos.
     *
     * `impuestos` se suma de sus partes y el neto sale por diferencia, no al
     * revés. Así neto + impuestos da el total exacto siempre, incluso en una
     * factura con no gravado o exento, donde tomar `neto_gravado` a secas
     * dejaría una punta sin explicar.
     */
    const num = (v: unknown) => Number(v) || 0
    const impuestos = redondear(
      (num(f.iva) +
        num(f.percepcion_iva) +
        num(f.percepcion_iibb_bsas) +
        num(f.percepcion_iibb_caba) +
        num(f.otros_impuestos)) *
        signo
    )
    const total = redondear(Number(f.total) * signo)
    const neto = redondear(total - impuestos)

    /*
     * El dólar del día en que se emitió, y el valor en pesos.
     *
     * Una factura en pesos no tiene ninguno de los dos: se muestra vacía, igual
     * que en la planilla, y su total pasa derecho a la columna de pesos. Una en
     * dólares se valúa al TC que tenía el día de emisión —no al de hoy—, que es
     * el peso que de verdad se facturó y el único con el que el número se puede
     * reclamar o conciliar.
     */
    const esDolar = moneda === "USD"
    const tcEmision = esDolar ? tc : null
    const totalArs = esDolar ? redondear(total * (tc ?? 0)) : total

    return {
      id: f.id as string,
      entidad: (esVenta ? cliente?.razon_social : proveedor?.razon_social) ?? "—",
      clase: f.clase as string,
      numero: `${String((f.punto_venta as number) ?? 0).padStart(5, "0")}-${String(
        (f.numero as number) ?? 0
      ).padStart(8, "0")}`,
      fecha: f.fecha as string,
      fechaVencimiento: (f.fecha_vencimiento as string | null) ?? null,
      // Se edita desde el propio reporte: es la columna donde se planifica la
      // cobranza mirando toda la lista junta.
      fechaEstimadaPago: (f.fecha_estimada_pago as string | null) ?? null,
      moneda,
      tc,
      signo,
      neto,
      impuestos,
      /** Solo en las facturas en dólares; en las de pesos va `null` y la
       *  columna queda vacía, como en la planilla. */
      totalUsd: esDolar ? total : null,
      tcEmision,
      totalArs,
      total,
      imputado: Number(f.imputado),
      saldo,
      // Valuado al TC del comprobante, no al de hoy: es el peso que se facturó.
      // El comprobante en dólares siempre tiene TC (lo exige la base), así que
      // el saldo en pesos siempre se puede calcular.
      saldoArs: moneda === "ARS" ? saldo : redondear(saldo * (tc as number)),
      // En dólares no: un comprobante en pesos sin cotización cargada no vale
      // USD 0, vale un importe que no conocemos. Va null y la tabla pone "—".
      saldoUsd:
        moneda === "USD" ? saldo : tc && tc > 0 ? redondear(saldo / tc) : null,
      detalle: (f.detalle as string | null) ?? null,
      /**
       * Una nota de crédito no vence.
       *
       * Tiene fecha de vencimiento en la base porque la comparte con las
       * facturas, pero no hay nada que reclamar: es crédito a favor del
       * cliente. Contándola, el reporte decía "6 vencidas" cuando hay 5 para ir
       * a cobrar, y restaba su importe del total vencido —que es justo el
       * número que se usa para decidir a quién llamar hoy—. El total general
       * sigue neteándola: ahí sí baja lo que nos deben.
       */
      vencida:
        signo === 1 && Boolean(f.fecha_vencimiento && (f.fecha_vencimiento as string) < hoy),
      /** Un pago o cobro a cuenta sin aplicar, no un comprobante. */
      aCuenta: false,
      /** Vencida, pero ya cubierta por un pago o cobro a cuenta sin aplicar. */
      cubierta: false,
    }
  })

  /*
   * Los pagos (o cobros) a cuenta que todavía tienen saldo sin aplicar.
   *
   * Lo pidió el estudio: «tiene que traer todo saldo diferente a cero, así sea a
   * favor del proveedor». Un anticipo que no se terminó de aplicar —Solution
   * Box: se pagó $5.850.740,93 y se facturaron $5.817.274,41— es saldo de la
   * cuenta corriente igual que una factura, con el signo al revés. Sin estas
   * filas, la ficha decía «-$ 33.466,52» y este reporte no lo mostraba en
   * ningún lado. (Se leen arriba, en `ordenesACuenta`.)
   */
  for (const o of ordenes) {
    const pago = pagoDe.get(o.pago_id as string) as
      | { tc: number | null; observaciones: string | null; cliente: unknown; proveedor: unknown }
      | undefined
    const nombre = (esVenta ? pago?.cliente : pago?.proveedor) as { razon_social: string } | null
    const moneda = (o.moneda === "USD" ? "USD" : "ARS") as "ARS" | "USD"
    const tc = pago?.tc === null || pago?.tc === undefined ? null : Number(pago.tc)
    // Crédito a favor nuestro (o del cliente): resta, como una nota de crédito.
    const saldo = -redondear(Number(o.saldo))
    const saldoArs = moneda === "ARS" ? saldo : redondear(saldo * (tc ?? 0))
    filas.push({
      id: `a-cuenta-${o.pago_id}`,
      entidad: nombre?.razon_social ?? "—",
      clase: esVenta ? "COBRO A CTA" : "PAGO A CTA",
      numero: "",
      fecha: o.fecha as string,
      fechaVencimiento: null,
      fechaEstimadaPago: null,
      moneda,
      tc,
      signo: -1,
      neto: saldo,
      impuestos: 0,
      totalUsd: moneda === "USD" ? saldo : null,
      tcEmision: moneda === "USD" ? tc : null,
      totalArs: saldoArs,
      total: saldo,
      imputado: 0,
      saldo,
      saldoArs,
      saldoUsd: moneda === "USD" ? saldo : tc && tc > 0 ? redondear(saldo / tc) : null,
      detalle: pago?.observaciones ?? null,
      vencida: false,
      aCuenta: true,
      cubierta: false,
    })
  }

  /*
   * Las facturas que el saldo a cuenta ya cubre.
   *
   * Es una forma de trabajar del cliente, no un descuido: con Andreani cobran
   * con muchos cheques que se acreditan de a uno, los cargan a cuenta y aplican
   * todo junto al final, para tener un solo asiento y una cuenta corriente
   * prolija. Mientras tanto esas facturas no se deben: ya se cobraron. Se
   * marcan y salen del total vencido —que es el número para salir a cobrar—,
   * sin tocar el total general, que ya resta las filas a cuenta.
   *
   * El saldo a cuenta de cada ficha se reparte por fecha de vencimiento, de la
   * más vieja en adelante, y una factura cuenta como cubierta solo si alcanza
   * para todo su saldo.
   */
  const aFavor = new Map<string, number>()
  for (const f of filas) {
    const ficha = String(f.entidad)
    if (f.aCuenta) aFavor.set(ficha, redondear((aFavor.get(ficha) ?? 0) - f.saldoArs))
  }
  if (aFavor.size) {
    const porVencer = filas
      .filter((f) => !f.aCuenta && f.signo === 1 && aFavor.has(String(f.entidad)))
      .sort((a, b) =>
        String(a.fechaVencimiento ?? "9999").localeCompare(String(b.fechaVencimiento ?? "9999"))
      )
    for (const f of porVencer) {
      const ficha = String(f.entidad)
      const disponible = aFavor.get(ficha) ?? 0
      if (disponible + 0.01 < f.saldoArs) continue
      aFavor.set(ficha, redondear(disponible - f.saldoArs))
      f.cubierta = f.vencida
    }
  }

  /*
   * La cotización de hoy, para el total.
   *
   * Es el único lugar del reporte donde entra el dólar de hoy, y a propósito:
   * cada factura se valúa al suyo —el del día que se emitió— y recién la suma
   * de todas se lleva a dólares de hoy, que es la pregunta "cuánto es esto en
   * dólares si lo cobrara ahora". Por eso viaja también cuándo se actualizó:
   * un número que cambia solo tiene que decir de cuándo es. (Se lee arriba,
   * junto con lo demás.)
   */
  const dolarHoy = Number(cot?.venta) || 0

  /*
   * Los totales suman el saldo, no el total facturado: una factura con un pago
   * parcial debe lo que le falta, no lo que dice el comprobante. Sumando
   * totales, el reporte daba por pendiente plata ya pagada.
   */
  const totalArs = redondear(filas.reduce((a, f) => a + f.saldoArs, 0))

  const totales = {
    cantidad: filas.length,
    /** Lo que falta pagar o cobrar, en pesos: cada saldo a su propio TC. */
    ars: totalArs,
    /** Esa misma suma, al dólar de hoy. `null` si no hay cotización cargada:
     *  mejor un guion que un número inventado. */
    usdHoy: dolarHoy > 0 ? redondear(totalArs / dolarHoy) : null,
    dolar: dolarHoy > 0 ? dolarHoy : null,
    dolarActualizado: (cot?.created_at as string | null) ?? null,
    vencidas: filas.filter((f) => f.vencida && !f.cubierta).length,
    vencidoArs: redondear(
      filas.filter((f) => f.vencida && !f.cubierta).reduce((a, f) => a + f.saldoArs, 0)
    ),
    /** Las vencidas que ya están cubiertas por un saldo a cuenta. */
    cubiertas: filas.filter((f) => f.cubierta).length,
    cubiertoArs: redondear(filas.filter((f) => f.cubierta).reduce((a, f) => a + f.saldoArs, 0)),
    /** Se avisa cuando el reporte se cortó: un total truncado presentado como
     *  completo es peor que no tenerlo. */
    truncado: filas.length >= TOPE,
  }

  return NextResponse.json({ filas, totales })
})

/**
 * Los pagos (o cobros) a cuenta con saldo, y el recibo de cada uno.
 *
 * Son dos consultas en cadena —la segunda necesita los ids de la primera—,
 * así que van juntas en una función para que el resto del reporte las pueda
 * esperar en paralelo con las otras lecturas.
 */
async function ordenesACuenta(esVenta: boolean) {
  const { data: ordenes } = await supabase
    .from("ordenes_a_cuenta")
    .select("pago_id, entidad_id, fecha, moneda, saldo")
    .eq("entidad_tipo", esVenta ? "cliente" : "proveedor")
    .gt("saldo", 0)
    .order("fecha", { ascending: true })
  const idsOrdenes = (ordenes ?? []).map((o) => o.pago_id as string)
  const { data: pagosOrdenes } = idsOrdenes.length
    ? await supabase
        .from("pagos")
        .select("id, tc, observaciones, cliente:clientes (razon_social), proveedor:proveedores (razon_social)")
        .in("id", idsOrdenes)
    : { data: [] as Record<string, unknown>[] }
  const pagoDe = new Map((pagosOrdenes ?? []).map((p) => [p.id as string, p as unknown]))
  return { ordenes: ordenes ?? [], pagoDe }
}
