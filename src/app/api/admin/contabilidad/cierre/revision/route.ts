import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { ruta } from "@/lib/admin/ruta"
import { esMes, finDeMes } from "@/lib/admin/cierre"

/**
 * Lo que conviene mirar antes de cerrar hasta un mes: las facturas que siguen
 * en borrador con fecha hasta ese día. Cerrado el mes, un borrador viejo ya no
 * se puede confirmar con esa fecha de registro, así que es lo primero que hay
 * que resolver. Los documentos sin asentar los trae la pantalla de la lista de
 * pendientes, que ya existe.
 */
export const GET = ruta("cierre revision GET", async (req: Request) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso

  const mes = new URL(req.url).searchParams.get("mes")
  if (!esMes(mes)) return NextResponse.json({ error: "Mes inválido" }, { status: 400 })
  const hasta = finDeMes(mes)

  const { data, error, count } = await supabase
    .from("comprobantes")
    .select("id, tipo, fecha, clase, punto_venta, numero", { count: "exact" })
    .eq("estado", "borrador")
    .lte("fecha", hasta)
    .order("fecha", { ascending: true })
    .limit(20)
  if (error) throw error

  return NextResponse.json({
    hasta,
    borradores: count ?? data.length,
    ejemplos: data.map((c) => ({
      id: c.id as string,
      tipo: c.tipo as "compra" | "venta",
      fecha: c.fecha as string,
      referencia: `${c.clase} ${String(c.punto_venta ?? 0).padStart(4, "0")}-${String(c.numero ?? 0).padStart(8, "0")}`,
    })),
  })
})
