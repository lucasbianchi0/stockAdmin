import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { ruta } from "@/lib/admin/ruta"

/**
 * Los vendedores existentes, para autocompletar el campo de la ficha del cliente.
 *
 * Solo lectura: el alta pasa por el propio formulario de cliente, que crea el
 * vendedor si el nombre que se escribió no existe. Es la razón por la que no hay
 * (todavía) una pantalla de ABM de vendedores — un maestro de tres campos que se
 * usa en un solo lugar no justifica una pantalla propia.
 */
export const GET = ruta("vendedores GET", async () => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso

  const { data, error } = await supabase
    .from("vendedores")
    .select("id, nombre")
    .eq("activo", true)
    .order("nombre", { ascending: true })

  if (error) {
    console.error("[vendedores GET]", error)
    return NextResponse.json({ error: "No se pudieron cargar los vendedores" }, { status: 500 })
  }

  return NextResponse.json({ vendedores: data ?? [] })
})
