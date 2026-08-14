import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { ruta } from "@/lib/admin/ruta"

/**
 * El plan de cuentas para los selectores.
 *
 * Devuelve solo las activas: el plan del contador trae cuentas que él mismo
 * marcó muertas ("NO USAR", "SIN USO") y que la migración dejó desactivadas.
 * Siguen existiendo para que lo histórico que las referencia no quede colgado,
 * pero ofrecerlas en un formulario es invitar a imputar contra una cuenta que el
 * estudio ya no mira. `?todas=1` las trae igual, para la pantalla de
 * mantenimiento.
 *
 * El orden es el del papel del contador —por número de cuenta— y no el
 * alfabético del código: `codigo` es texto, así que ordenar por él pone la 10
 * antes que la 9.
 */
export const GET = ruta("plan-cuentas GET", async (req: Request) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso

  const todas = new URL(req.url).searchParams.get("todas") === "1"

  let query = supabase
    .from("plan_cuentas")
    .select(
      `id, codigo, nombre, tipo, orden, imputable, activo,
       lleva_subcuenta, tipo_subcuenta, es_banco, es_valores,
       libro_iva, moneda_extranjera, es_medio_pago`
    )

  if (!todas) query = query.eq("activo", true).eq("imputable", true)

  const { data, error } = await query
    .order("orden", { ascending: true })
    .order("codigo", { ascending: true })

  if (error) {
    console.error("[plan-cuentas GET]", error)
    return NextResponse.json({ error: "No se pudo cargar el plan de cuentas" }, { status: 500 })
  }

  // A camelCase acá y no en la pantalla: es el mismo contrato que usa el resto
  // del módulo, y así el tipo `CuentaContable` describe lo que realmente llega.
  const cuentas = (data ?? []).map((c) => ({
    id: c.id as string,
    codigo: c.codigo as string,
    nombre: c.nombre as string,
    tipo: c.tipo as string,
    orden: Number(c.orden ?? 0),
    imputable: Boolean(c.imputable),
    activo: Boolean(c.activo),
    llevaSubcuenta: Boolean(c.lleva_subcuenta),
    tipoSubcuenta: (c.tipo_subcuenta as string | null) ?? null,
    esBanco: Boolean(c.es_banco),
    esValores: Boolean(c.es_valores),
    libroIva: (c.libro_iva as string | null) ?? null,
    monedaExtranjera: Boolean(c.moneda_extranjera),
    esMedioPago: Boolean(c.es_medio_pago),
  }))

  return NextResponse.json({ cuentas })
})
