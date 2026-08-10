import { NextResponse } from "next/server"

import { supabase } from "@/lib/supabase"
import type { Pendiente } from "@/lib/admin/cobros"
import type { TipoPago } from "@/lib/admin/cobros-server"

/**
 * Las facturas de un cliente que todavía deben algo.
 *
 * Consulta la vista `comprobantes_saldo`, que hace `total − Σ imputado`. Va
 * contra la vista y no contra la tabla porque el filtro que importa —"saldo
 * mayor a cero"— no existe como columna en la tabla: si se calculara del lado
 * del cliente habría que bajar todas las facturas del cliente para descartar
 * las pagadas.
 *
 * Orden por vencimiento ascendente: lo que vence primero es lo que hay que
 * cobrar primero, y así el panel de imputación ya viene priorizado.
 */
export async function listarPendientes(tipo: TipoPago, req: Request) {
  const esCobro = tipo === "cobro"
  const campo = esCobro ? "cliente_id" : "proveedor_id"
  const tipoComprobante = esCobro ? "venta" : "compra"

  const entidadId = new URL(req.url).searchParams.get("entidadId") ?? ""
  if (!entidadId) {
    return NextResponse.json(
      { error: esCobro ? "Falta el cliente" : "Falta el proveedor" },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from("comprobantes_saldo")
    .select(
      "id, clase, punto_venta, numero, fecha, fecha_vencimiento, moneda, tc, total, imputado, saldo, detalle, signo"
    )
    .eq("tipo", tipoComprobante)
    .eq(campo, entidadId)
    .gt("saldo", 0)
    .order("fecha_vencimiento", { ascending: true, nullsFirst: false })
    .order("fecha", { ascending: true })
    .limit(200)

  if (error) {
    console.error(`[${tipo} pendientes]`, error)
    return NextResponse.json(
      { error: "No se pudieron cargar los comprobantes pendientes" },
      { status: 500 }
    )
  }

  const pendientes: Pendiente[] = (data ?? []).map((f) => ({
    id: f.id as string,
    clase: f.clase as string,
    puntoVenta: (f.punto_venta as number | null) ?? null,
    numero: (f.numero as number | null) ?? null,
    fecha: f.fecha as string,
    fechaVencimiento: (f.fecha_vencimiento as string | null) ?? null,
    moneda: f.moneda as Pendiente["moneda"],
    tc: Number(f.tc),
    total: Number(f.total),
    imputado: Number(f.imputado),
    saldo: Number(f.saldo),
    detalle: (f.detalle as string | null) ?? null,
    signo: Number(f.signo) === -1 ? -1 : 1,
  }))

  return NextResponse.json({ pendientes })
}
