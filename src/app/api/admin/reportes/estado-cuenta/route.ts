import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { ruta } from "@/lib/admin/ruta"
import { redondear } from "@/lib/admin/moneda"

/**
 * Estado de cuenta de un cliente o un proveedor.
 *
 * Es el reporte del pliego, con el mismo formato del ejemplo: cada comprobante y
 * cada pago en una fila, ordenados por fecha, con el saldo corrido.
 *
 * La decisión que lo hace útil: **el saldo corre en pesos históricos**. Cada
 * fila se valúa al tipo de cambio que tenía su documento el día que se emitió,
 * no al de hoy. Convertir todo al dólar de hoy daría un saldo que cambia solo de
 * un día para el otro sin que nadie haya facturado ni cobrado nada — y ese
 * número no se puede reclamar ni conciliar contra nada.
 *
 * Los importes en dólares se muestran aparte, sin sumarse a los de pesos: son
 * dos columnas informativas, no un total mezclado.
 */

type Fila = {
  fecha: string
  tipo: string
  comprobante: string | null
  detalle: string | null
  /**
   * Lo que se escribió en el campo Observaciones del documento.
   *
   * Va en su propia columna y no mezclado con `detalle` porque son dos cosas
   * distintas y el pliego pide justo esta: «Lo que figura en OBSERVACIONES, que
   * impacte en una columna del estado de cuenta del cliente». `detalle` es el
   * concepto de la factura —qué se vendió—; las observaciones son la nota que
   * alguien dejó para el que después reclama el saldo (la orden de compra
   * contra la que va, el reclamo pendiente, el acuerdo de plazo).
   */
  observaciones: string | null
  moneda: "ARS" | "USD"
  /** El importe en la moneda original, con signo. */
  importe: number
  importeUsd: number | null
  /** `null` cuando el documento no tiene cotización cargada. */
  tc: number | null
  /** El importe en pesos históricos, con signo. Es lo que acumula el saldo. */
  importeArs: number
  saldo: number
  /**
   * Si el comprobante todavía debe algo. Es lo que marca el asterisco de la
   * pantalla y lo que filtra el interruptor de "solo impagas". Un recibo nunca
   * es impago: es el que paga.
   */
  impaga: boolean
  /** Lo que le falta cobrar a ESE comprobante, en pesos históricos y con signo.
   *  `null` en los recibos. Es el número que importa cuando se mira la cuenta
   *  filtrada: ahí el saldo corrido no significa nada. */
  pendienteArs: number | null
}

export const GET = ruta("estado de cuenta", async (req: Request) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso

  const url = new URL(req.url)
  const tipo = url.searchParams.get("tipo") === "proveedor" ? "proveedor" : "cliente"
  const entidadId = url.searchParams.get("entidadId") ?? ""
  const desde = url.searchParams.get("desde") ?? ""
  const hasta = url.searchParams.get("hasta") ?? ""

  if (!entidadId) {
    return NextResponse.json({ error: "Elegí una ficha" }, { status: 400 })
  }

  const esCliente = tipo === "cliente"
  const tablaEntidad = esCliente ? "clientes" : "proveedores"
  const campo = esCliente ? "cliente_id" : "proveedor_id"
  const tipoComprobante = esCliente ? "venta" : "compra"
  const tipoPago = esCliente ? "cobro" : "pago"

  /* La ficha, para la cabecera del reporte. */
  const { data: entidad } = await supabase
    .from(tablaEntidad)
    .select("id, razon_social, cuit")
    .eq("id", entidadId)
    .maybeSingle()

  if (!entidad) return NextResponse.json({ error: "No encontrado" }, { status: 404 })

  /* Comprobantes.
   *
   * Sale de `comprobantes_vigentes` y no de la tabla por dos motivos. Trae el
   * `saldo` —total menos lo imputado—, que es lo que dice si la factura está
   * impaga. Y filtra por estado: un borrador no es deuda de nadie y estaba
   * entrando al saldo corrido como si lo fuera. */
  let qComp = supabase
    .from("comprobantes_vigentes")
    .select(
      "id, clase, punto_venta, numero, fecha, moneda, tc, total, total_ars, total_usd, saldo, signo, detalle, observaciones"
    )
    .eq("tipo", tipoComprobante)
    .eq(campo, entidadId)

  if (desde) qComp = qComp.gte("fecha", desde)
  if (hasta) qComp = qComp.lte("fecha", hasta)

  const { data: comprobantes, error: errComp } = await qComp

  if (errComp) {
    console.error("[estado-cuenta comprobantes]", errComp)
    return NextResponse.json({ error: "No se pudo armar el estado de cuenta" }, { status: 500 })
  }

  /* Pagos, con sus imputaciones para saber cuánto aplicó a este circuito. */
  let qPagos = supabase
    .from("pagos")
    .select(
      "id, fecha, moneda, tc, a_cuenta, observaciones, imputaciones (importe, comprobante:comprobantes (moneda, tc, signo))"
    )
    .eq("tipo", tipoPago)
    .eq(campo, entidadId)

  if (desde) qPagos = qPagos.gte("fecha", desde)
  if (hasta) qPagos = qPagos.lte("fecha", hasta)

  const { data: pagos, error: errPagos } = await qPagos

  if (errPagos) {
    console.error("[estado-cuenta pagos]", errPagos)
    return NextResponse.json({ error: "No se pudo armar el estado de cuenta" }, { status: 500 })
  }

  /* ── Armado de las filas ──────────────────────────────────────────────── */

  const filas: Omit<Fila, "saldo">[] = []

  for (const c of comprobantes ?? []) {
    const signo = Number(c.signo) === -1 ? -1 : 1
    // Medio centavo de tolerancia: una factura cancelada al peso puede quedar
    // con un resto de redondeo que no es una deuda.
    const saldo = Number(c.saldo) || 0
    const impaga = saldo > 0.005
    const tcComp = c.tc === null ? null : Number(c.tc)
    filas.push({
      fecha: c.fecha as string,
      tipo: c.clase as string,
      comprobante: numeroFormateado(c.punto_venta as number | null, c.numero as number | null),
      detalle: (c.detalle as string | null) ?? null,
      observaciones: (c.observaciones as string | null) ?? null,
      moneda: c.moneda as "ARS" | "USD",
      importe: redondear(Number(c.total) * signo),
      // Ahora también sale en los comprobantes en pesos que tengan TC cargado:
      // `total_usd` es null solo cuando de verdad no se conoce la cotización.
      importeUsd:
        c.total_usd === null ? null : redondear(Number(c.total_usd) * signo),
      tc: tcComp,
      importeArs: redondear(Number(c.total_ars) * signo),
      impaga,
      // Valuado al TC del propio comprobante, igual que el importe: es el peso
      // que se facturó, no el de hoy.
      pendienteArs: redondear(
        saldo * signo * (c.moneda === "ARS" ? 1 : (tcComp ?? 0))
      ),
    })
  }

  for (const p of pagos ?? []) {
    // Lo que el recibo canceló, valuado en pesos con el TC de cada comprobante
    // imputado. Se valúa por comprobante y no por recibo porque un mismo pago
    // puede cancelar una factura en dólares y otra en pesos.
    // Por el signo de cada comprobante: la nota de crédito ya bajó la deuda en su
    // propia fila del extracto, así que el recibo que la aplica tiene que restar
    // la factura menos la nota. Sumando las dos, la NC descontaba dos veces y el
    // saldo del cliente terminaba a favor sin que nadie hubiera pagado de más.
    const signoDe = (c: { signo?: number | null } | null) =>
      Number(c?.signo) === -1 ? -1 : 1

    const enPesos = (p.imputaciones ?? []).reduce((acc: number, i) => {
      const imp = Number(i.importe)
      const comp = i.comprobante as unknown as {
        moneda: string
        tc: number
        signo: number
      } | null
      if (!comp) return acc + imp
      return acc + signoDe(comp) * (comp.moneda === "USD" ? imp * Number(comp.tc) : imp)
    }, 0)

    const enUsd = (p.imputaciones ?? []).reduce((acc: number, i) => {
      const comp = i.comprobante as unknown as {
        moneda: string
        tc: number
        signo: number
      } | null
      if (!comp || comp.moneda !== "USD") return acc
      return acc + signoDe(comp) * Number(i.importe)
    }, 0)

    /*
     * Lo que el recibo no imputó también mueve la cuenta corriente.
     *
     * Un anticipo —plata entregada antes de que exista la factura— no tiene
     * ninguna imputación, así que sumando solo esas el recibo no aparecía y el
     * saldo decía que le debemos todo al proveedor cuando ya le pagamos. Con el
     * `a_cuenta` adentro, la fila vale lo que de verdad se movió y el saldo
     * queda a favor hasta que la factura llegue.
     */
    const aCuenta = Number(p.a_cuenta) || 0
    const aCuentaArs =
      p.moneda === "ARS" ? aCuenta : redondear(aCuenta * (Number(p.tc) || 0))

    filas.push({
      fecha: p.fecha as string,
      tipo: esCliente ? "COBRO" : "PAGO",
      comprobante: null,
      detalle: null,
      observaciones: (p.observaciones as string | null) ?? null,
      moneda: p.moneda as "ARS" | "USD",
      importe: -redondear(enPesos + aCuentaArs),
      // `!== 0` y no `> 0`: un recibo puede netear a cero —una NC aplicada
      // contra su factura— y eso no es lo mismo que no tener parte en dólares.
      importeUsd: (() => {
        const usd = enUsd + (p.moneda === "USD" ? aCuenta : 0)
        return redondear(usd) !== 0 ? -redondear(usd) : null
      })(),
      tc: p.tc === null ? null : Number(p.tc),
      importeArs: -redondear(enPesos + aCuentaArs),
      // Un recibo no se cobra ni se debe: es lo que cancela a los otros.
      impaga: false,
      pendienteArs: null,
    })
  }

  // Por fecha, y a igual fecha el comprobante antes que el pago: un recibo que
  // aparece arriba de la factura que cancela deja el saldo en negativo en el
  // medio del reporte y parece un error.
  filas.sort((a, b) => {
    if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1
    const pesoA = a.importeArs >= 0 ? 0 : 1
    const pesoB = b.importeArs >= 0 ? 0 : 1
    return pesoA - pesoB
  })

  let corrido = 0
  const conSaldo: Fila[] = filas.map((f) => {
    corrido = redondear(corrido + f.importeArs)
    return { ...f, saldo: corrido }
  })

  return NextResponse.json({
    entidad: {
      id: entidad.id,
      razonSocial: entidad.razon_social,
      cuit: entidad.cuit,
      tipo,
    },
    filas: conSaldo,
    saldoFinal: corrido,
  })
})

function numeroFormateado(pv: number | null, nro: number | null): string | null {
  if (pv === null && nro === null) return null
  return `${String(pv ?? 0).padStart(5, "0")}-${String(nro ?? 0).padStart(8, "0")}`
}
