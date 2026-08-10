import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { ruta } from "@/lib/admin/ruta"

/**
 * El plan de cuentas para los selectores.
 *
 * Por defecto devuelve solo las imputables: las cuentas de agrupación (`1`,
 * `1.1`, `5.2`) existen para dar niveles al árbol y ofrecerlas en un formulario
 * es invitar a imputar contra un total, que después no se puede desagregar.
 * `?todas=1` trae el árbol entero para la pantalla de mantenimiento.
 */
export const GET = ruta("plan-cuentas GET", async (req: Request) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso

  const todas = new URL(req.url).searchParams.get("todas") === "1"

  let query = supabase
    .from("plan_cuentas")
    .select("id, codigo, nombre, tipo, imputable, padre_id")
    .eq("activo", true)

  if (!todas) query = query.eq("imputable", true)

  const { data, error } = await query.order("codigo", { ascending: true })

  if (error) {
    console.error("[plan-cuentas GET]", error)
    return NextResponse.json({ error: "No se pudo cargar el plan de cuentas" }, { status: 500 })
  }

  return NextResponse.json({ cuentas: data ?? [] })
})
