import { NextResponse } from "next/server"

import { supabase } from "@/lib/supabase"
import { aCobro, SELECT_COBRO, type TipoPago } from "@/lib/admin/cobros-server"

export async function obtenerPago(tipo: TipoPago, id: string) {
  const { data, error } = await supabase
    .from("pagos")
    .select(SELECT_COBRO)
    .eq("id", id)
    .eq("tipo", tipo)
    .maybeSingle()

  if (error) {
    console.error(`[${tipo} GET id]`, error)
    return NextResponse.json({ error: `No se pudo cargar el ${tipo}` }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: "No encontrado" }, { status: 404 })

  return NextResponse.json({ [tipo]: aCobro(data) })
}

/**
 * Anular un recibo.
 *
 * No hay edición de cobros a propósito: cambiar un recibo ya imputado significa
 * recalcular saldos de varias facturas y mover plata entre cuentas, y hacerlo
 * por partes deja estados intermedios inconsistentes. Anular y volver a cargar
 * es más largo de tipear y mucho más difícil de romper.
 *
 * El borrado se lleva las imputaciones y los movimientos por `on delete
 * cascade`: las facturas vuelven a quedar pendientes solas y el saldo de la
 * cuenta se recalcula solo, porque ninguno de los dos está guardado como campo.
 */
export async function anularPago(tipo: TipoPago, id: string) {
  const { data, error } = await supabase
    .from("pagos")
    .delete()
    .eq("id", id)
    .eq("tipo", tipo)
    .select("id")
    .maybeSingle()

  if (error) {
    console.error(`[${tipo} DELETE]`, error)
    return NextResponse.json({ error: `No se pudo anular el ${tipo}` }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: "No encontrado" }, { status: 404 })

  return NextResponse.json({ ok: true })
}
