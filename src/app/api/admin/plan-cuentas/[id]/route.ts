import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { ruta } from "@/lib/admin/ruta"

/**
 * Activar o desactivar una cuenta del plan.
 *
 * Es lo único que se edita desde la pantalla, y es a propósito: el nombre, el
 * rubro y las banderas los mantiene el estudio en su Excel, y dejarlos editables
 * acá garantizaría que la próxima importación pise el cambio sin avisar. Lo que
 * sí es una decisión de este lado es qué cuentas se ofrecen al imputar.
 *
 * Desactivar no borra ni esconde nada de lo ya imputado: la cuenta sigue en el
 * mayor y en el balance, deja de aparecer en los selectores y nada más.
 */
export const PATCH = ruta(
  "plan-cuentas PATCH",
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const sinPermiso = await exigirModulo("administracion")
    if (sinPermiso) return sinPermiso

    const { id } = await ctx.params

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Body inválido" }, { status: 400 })
    }

    const raw = (body ?? {}) as Record<string, unknown>
    if (typeof raw.activo !== "boolean") {
      return NextResponse.json({ error: "Falta decir si queda activa" }, { status: 400 })
    }

    const { data, error } = await supabase
      .from("plan_cuentas")
      .update({ activo: raw.activo })
      .eq("id", id)
      .select("id, codigo, nombre, activo")
      .maybeSingle()

    if (error) {
      console.error("[plan-cuentas PATCH]", error)
      return NextResponse.json({ error: "No se pudo actualizar la cuenta" }, { status: 500 })
    }
    if (!data) return NextResponse.json({ error: "La cuenta no existe" }, { status: 404 })

    return NextResponse.json({ cuenta: data })
  }
)
