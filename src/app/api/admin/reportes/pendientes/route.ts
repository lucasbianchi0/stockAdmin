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

  const { data, error } = await supabase
    .from("comprobantes_vigentes")
    .select(
      `id, clase, punto_venta, numero, fecha, fecha_vencimiento, moneda, tc, total, imputado, saldo, detalle, signo,
       cliente:clientes (id, razon_social),
       proveedor:proveedores (id, razon_social)`
    )
    .eq("tipo", tipo)
    .gt("saldo", 0)
    .order("fecha_vencimiento", { ascending: true, nullsFirst: false })
    .order("fecha", { ascending: true })
    .limit(TOPE)

  if (error) {
    console.error("[reportes pendientes]", error)
    return NextResponse.json({ error: "No se pudo armar el reporte" }, { status: 500 })
  }

  const hoy = new Date().toISOString().slice(0, 10)

  const filas = (data ?? []).map((f) => {
    const cliente = f.cliente as unknown as { id: string; razon_social: string } | null
    const proveedor = f.proveedor as unknown as { id: string; razon_social: string } | null
    const saldo = Number(f.saldo)
    const tc = f.tc === null ? null : Number(f.tc)
    const moneda = f.moneda as "ARS" | "USD"

    return {
      id: f.id as string,
      entidad: (esVenta ? cliente?.razon_social : proveedor?.razon_social) ?? "—",
      clase: f.clase as string,
      numero: `${String((f.punto_venta as number) ?? 0).padStart(5, "0")}-${String(
        (f.numero as number) ?? 0
      ).padStart(8, "0")}`,
      fecha: f.fecha as string,
      fechaVencimiento: (f.fecha_vencimiento as string | null) ?? null,
      moneda,
      tc,
      total: Number(f.total),
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
      vencida: Boolean(f.fecha_vencimiento && (f.fecha_vencimiento as string) < hoy),
    }
  })

  const totales = {
    cantidad: filas.length,
    ars: redondear(filas.filter((f) => f.moneda === "ARS").reduce((a, f) => a + f.saldo, 0)),
    usd: redondear(filas.filter((f) => f.moneda === "USD").reduce((a, f) => a + f.saldo, 0)),
    vencidas: filas.filter((f) => f.vencida).length,
    vencidoArs: redondear(
      filas.filter((f) => f.vencida && f.moneda === "ARS").reduce((a, f) => a + f.saldo, 0)
    ),
    vencidoUsd: redondear(
      filas.filter((f) => f.vencida && f.moneda === "USD").reduce((a, f) => a + f.saldo, 0)
    ),
    /** Se avisa cuando el reporte se cortó: un total truncado presentado como
     *  completo es peor que no tenerlo. */
    truncado: filas.length >= TOPE,
  }

  return NextResponse.json({ filas, totales })
})
