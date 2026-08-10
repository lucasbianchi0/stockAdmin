import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { ruta } from "@/lib/admin/ruta"
import type { CuentaFinanciera } from "@/lib/admin/cobros"

/**
 * Cajas, bancos y billeteras con su saldo actual.
 *
 * Lee de la vista `cuentas_saldo` (saldo inicial + Σ movimientos con signo) y no
 * de una columna guardada: un saldo denormalizado se desfasa el día que se anula
 * un cobro, y un saldo de banco equivocado es de las cosas que más rápido hacen
 * que se deje de confiar en un sistema.
 */
export const GET = ruta("cuentas GET", async () => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso

  const { data, error } = await supabase
    .from("cuentas_saldo")
    .select("id, nombre, tipo, moneda, saldo, activo, orden")
    .eq("activo", true)
    .order("orden", { ascending: true })

  if (error) {
    console.error("[cuentas GET]", error)
    return NextResponse.json({ error: "No se pudieron cargar las cuentas" }, { status: 500 })
  }

  const cuentas: CuentaFinanciera[] = (data ?? []).map((c) => ({
    id: c.id as string,
    nombre: c.nombre as string,
    tipo: c.tipo as CuentaFinanciera["tipo"],
    moneda: c.moneda as CuentaFinanciera["moneda"],
    saldo: Number(c.saldo),
  }))

  return NextResponse.json({ cuentas })
})
