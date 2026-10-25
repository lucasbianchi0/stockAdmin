import { NextResponse } from "next/server"

import { supabase } from "@/lib/supabase"
import { listarEquipo } from "@/lib/tickets-server"
import { CODIGO_PERIODO_CERRADO, type MovimientoCierre } from "@/lib/admin/cierre"

/**
 * El rechazo de un período cerrado, listo para devolver.
 *
 * Los handlers de carga convierten los errores de la base en un «No se pudo
 * guardar» genérico, y está bien: un error de Postgres no es para la persona.
 * Este sí: lo escribe el trigger del cierre en castellano y dice exactamente
 * qué pasó y qué hacer. Sin esto la persona vería «No se pudo registrar el
 * pago» y lo intentaría tres veces.
 */
export function respuestaPeriodoCerrado(
  error: { code?: string; message?: string } | null | undefined
): NextResponse | null {
  if (!error || error.code !== CODIGO_PERIODO_CERRADO) return null
  return NextResponse.json({ error: error.message }, { status: 409 })
}

/** El historial, del más nuevo al más viejo, con el nombre de quien lo hizo. */
export async function leerHistorialCierre(): Promise<MovimientoCierre[]> {
  const [{ data, error }, equipo] = await Promise.all([
    supabase
      .from("cierres_periodo")
      .select("id, hasta, accion, motivo, created_at, created_by")
      .order("id", { ascending: false })
      .limit(200),
    listarEquipo(),
  ])
  if (error) throw error

  const nombres = new Map(equipo.map((u) => [u.id, u.nombre]))
  return (data ?? []).map((f) => ({
    id: Number(f.id),
    accion: f.accion as MovimientoCierre["accion"],
    hasta: (f.hasta as string | null) ?? null,
    motivo: (f.motivo as string | null) ?? null,
    fecha: f.created_at as string,
    usuario: (f.created_by && nombres.get(f.created_by as string)) || "—",
  }))
}
