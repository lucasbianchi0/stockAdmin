import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { ruta } from "@/lib/admin/ruta"

/**
 * Las facturas de compra marcadas VISA que todavía deben algo.
 *
 * La marca vive en `comprobantes` y el saldo en `comprobantes_vigentes`, que
 * se armó antes de la columna y no la trae: por eso son dos consultas. Sin la
 * migración 20261026_02 la primera falla y se contesta lista vacía con aviso,
 * en vez de un error que deje la pantalla en blanco.
 */
export const GET = ruta("pagos visa GET", async () => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso

  const { data: marcadas, error } = await supabase
    .from("comprobantes")
    .select("id")
    .eq("tipo", "compra")
    .eq("estado", "confirmado")
    .eq("tarjeta_visa", true)
    .limit(1000)
  if (error) return NextResponse.json({ facturas: [], sinMigracion: true })

  const ids = (marcadas ?? []).map((c) => c.id as string)
  if (!ids.length) return NextResponse.json({ facturas: [] })

  const { data, error: errSaldo } = await supabase
    .from("comprobantes_vigentes")
    .select("id, clase, punto_venta, numero, fecha, moneda, tc, total, saldo, detalle, proveedor:proveedores (id, razon_social)")
    .in("id", ids)
    .gt("saldo", 0)
    .order("fecha", { ascending: true })
  if (errSaldo) throw errSaldo

  return NextResponse.json({
    facturas: (data ?? []).map((f) => {
      const p = f.proveedor as unknown as { id: string; razon_social: string } | null
      return {
        id: f.id as string,
        proveedorId: p?.id ?? null,
        proveedor: p?.razon_social ?? "—",
        clase: f.clase as string,
        numero: `${String(f.punto_venta ?? 0).padStart(5, "0")}-${String(f.numero ?? 0).padStart(8, "0")}`,
        fecha: f.fecha as string,
        moneda: f.moneda as "ARS" | "USD",
        total: Number(f.total),
        saldo: Number(f.saldo),
        detalle: (f.detalle as string | null) ?? null,
      }
    }),
  })
})
