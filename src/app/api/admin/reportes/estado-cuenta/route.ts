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
  moneda: "ARS" | "USD"
  /** El importe en la moneda original, con signo. */
  importe: number
  importeUsd: number | null
  /** `null` cuando el documento no tiene cotización cargada. */
  tc: number | null
  /** El importe en pesos históricos, con signo. Es lo que acumula el saldo. */
  importeArs: number
  saldo: number
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

  /* Comprobantes. */
  let qComp = supabase
    .from("comprobantes")
    .select("id, clase, punto_venta, numero, fecha, moneda, tc, total, total_ars, total_usd, signo, detalle")
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
    .select("id, fecha, moneda, tc, observaciones, imputaciones (importe, comprobante:comprobantes (moneda, tc))")
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
    filas.push({
      fecha: c.fecha as string,
      tipo: c.clase as string,
      comprobante: numeroFormateado(c.punto_venta as number | null, c.numero as number | null),
      detalle: (c.detalle as string | null) ?? null,
      moneda: c.moneda as "ARS" | "USD",
      importe: redondear(Number(c.total) * signo),
      // Ahora también sale en los comprobantes en pesos que tengan TC cargado:
      // `total_usd` es null solo cuando de verdad no se conoce la cotización.
      importeUsd:
        c.total_usd === null ? null : redondear(Number(c.total_usd) * signo),
      tc: c.tc === null ? null : Number(c.tc),
      importeArs: redondear(Number(c.total_ars) * signo),
    })
  }

  for (const p of pagos ?? []) {
    // Lo que el recibo canceló, valuado en pesos con el TC de cada comprobante
    // imputado. Se valúa por comprobante y no por recibo porque un mismo pago
    // puede cancelar una factura en dólares y otra en pesos.
    const enPesos = (p.imputaciones ?? []).reduce((acc: number, i) => {
      const imp = Number(i.importe)
      const comp = i.comprobante as unknown as { moneda: string; tc: number } | null
      if (!comp) return acc + imp
      return acc + (comp.moneda === "USD" ? imp * Number(comp.tc) : imp)
    }, 0)

    const enUsd = (p.imputaciones ?? []).reduce((acc: number, i) => {
      const comp = i.comprobante as unknown as { moneda: string; tc: number } | null
      if (!comp || comp.moneda !== "USD") return acc
      return acc + Number(i.importe)
    }, 0)

    filas.push({
      fecha: p.fecha as string,
      tipo: esCliente ? "COBRO" : "PAGO",
      comprobante: null,
      detalle: (p.observaciones as string | null) ?? null,
      moneda: p.moneda as "ARS" | "USD",
      importe: -redondear(enPesos),
      importeUsd: enUsd > 0 ? -redondear(enUsd) : null,
      tc: p.tc === null ? null : Number(p.tc),
      importeArs: -redondear(enPesos),
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
