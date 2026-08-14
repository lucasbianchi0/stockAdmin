import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { ruta } from "@/lib/admin/ruta"
import { redondear } from "@/lib/admin/moneda"
import type { CuentaFinanciera } from "@/lib/admin/cobros"

/**
 * Cajas, bancos y billeteras con su saldo actual.
 *
 * Lee de la vista `cuentas_saldo` (saldo inicial + Σ movimientos con signo) y no
 * de una columna guardada: un saldo denormalizado se desfasa el día que se anula
 * un cobro, y un saldo de banco equivocado es de las cosas que más rápido hacen
 * que se deje de confiar en un sistema.
 *
 * Con `?detalle=1` agrega lo que necesita la pantalla de Caja y Bancos para que
 * cada tarjeta diga algo más que el saldo: cuánto se movió en el mes y cuántos
 * movimientos quedan sin conciliar. Va detrás de un parámetro porque los
 * selectores de los formularios de cobro no necesitan nada de eso y sería una
 * consulta extra en cada apertura de diálogo.
 */
export const GET = ruta("cuentas GET", async (req: Request) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso

  const conDetalle = new URL(req.url).searchParams.get("detalle") === "1"

  const { data, error } = await supabase
    .from("cuentas_saldo")
    .select(
      "id, nombre, tipo, moneda, banco, numero_cuenta, alias, saldo, saldo_inicial, activo, orden"
    )
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
    banco: (c.banco as string | null) ?? null,
    numeroCuenta: (c.numero_cuenta as string | null) ?? null,
    alias: (c.alias as string | null) ?? null,
  }))

  if (!conDetalle || cuentas.length === 0) {
    return NextResponse.json({ cuentas })
  }

  /* ── El movimiento del mes y lo que falta conciliar ───────────────────── */

  const hoy = new Date()
  const primeroDelMes = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-01`

  // Una sola consulta para todas las cuentas y no una por tarjeta: nueve
  // consultas en paralelo contra la misma tabla es la forma más rápida de
  // convertir una pantalla de 200 ms en una de dos segundos.
  const { data: movs, error: errMovs } = await supabase
    .from("movimientos")
    .select("cuenta_id, importe, signo, fecha, conciliado")
    .in(
      "cuenta_id",
      cuentas.map((c) => c.id)
    )
    .gte("fecha", primeroDelMes)

  if (errMovs) {
    // Las tarjetas se dibujan igual con el saldo solo. Es preferible a que la
    // pantalla entera falle porque no se pudo calcular un dato secundario.
    console.error("[cuentas detalle]", errMovs)
    return NextResponse.json({ cuentas })
  }

  const porCuenta = new Map<string, { entradas: number; salidas: number; sinConciliar: number }>()
  for (const m of movs ?? []) {
    const id = m.cuenta_id as string
    const acc = porCuenta.get(id) ?? { entradas: 0, salidas: 0, sinConciliar: 0 }
    if (Number(m.signo) === 1) acc.entradas += Number(m.importe)
    else acc.salidas += Number(m.importe)
    if (!m.conciliado) acc.sinConciliar++
    porCuenta.set(id, acc)
  }

  return NextResponse.json({
    cuentas: cuentas.map((c) => {
      const d = porCuenta.get(c.id)
      return {
        ...c,
        entradasMes: redondear(d?.entradas ?? 0),
        salidasMes: redondear(d?.salidas ?? 0),
        sinConciliar: d?.sinConciliar ?? 0,
      }
    }),
  })
})
