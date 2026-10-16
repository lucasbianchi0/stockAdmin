import { NextResponse } from "next/server"

import { exigirAdmin } from "@/lib/guard-api"
import { ruta } from "@/lib/admin/ruta"
import { buscarComprobantes, dolarDe } from "@/lib/admin/stock-server"

/**
 * Las facturas confirmadas a las que se puede colgar una compra o una venta, y
 * el dólar de una fecha para valorizar lo que no viene de una factura en USD.
 */
export const GET = ruta("stock comprobantes GET", async (req: Request) => {
  const { error } = await exigirAdmin()
  if (error) return error
  const url = new URL(req.url)
  const fecha = url.searchParams.get("dolar")
  if (fecha) return NextResponse.json({ tc: await dolarDe(fecha) })
  const tipo = url.searchParams.get("tipo") === "venta" ? "venta" : "compra"
  return NextResponse.json({ comprobantes: await buscarComprobantes(tipo, url.searchParams.get("q") ?? "") })
})
