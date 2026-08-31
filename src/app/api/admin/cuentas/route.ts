import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { ruta } from "@/lib/admin/ruta"
import { redondear } from "@/lib/admin/moneda"
import {
  SELECT_CUENTA,
  aCuentaDetalle,
  camposDeCuenta,
  esNombreRepetido,
} from "@/lib/admin/cuentas-server"
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
 *
 * Con `?todas=1` vienen también las dadas de baja. Solo lo pide la pantalla de
 * Caja y Bancos: una cuenta desactivada tiene que poder volver, y si la única
 * lista que la muestra la filtra, dar de baja es un viaje de ida.
 */
export const GET = ruta("cuentas GET", async (req: Request) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso

  const parametros = new URL(req.url).searchParams
  const conDetalle = parametros.get("detalle") === "1"
  const todas = parametros.get("todas") === "1"

  let consulta = supabase
    .from("cuentas_saldo")
    .select(
      "id, nombre, tipo, moneda, banco, numero_cuenta, alias, saldo, saldo_inicial, activo, orden"
    )

  if (!todas) consulta = consulta.eq("activo", true)

  const { data, error } = await consulta.order("orden", { ascending: true })

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
    activo: Boolean(c.activo),
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

/* ── POST · una cuenta nueva ──────────────────────────────────────────────── */

/**
 * Dar de alta una caja, un banco o una billetera.
 *
 * Antes esto se hacía por SQL, que es la razón por la que abrir una cuenta nueva
 * en el banco dejaba al sistema sin dónde registrarla hasta que alguien corriera
 * un insert a mano.
 */
export const POST = ruta("cuentas POST", async (req: Request) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }

  const campos = camposDeCuenta(body as Record<string, unknown>, "alta")
  if ("error" in campos) return NextResponse.json({ error: campos.error }, { status: 400 })

  const { data, error } = await supabase
    .from("cuentas_financieras")
    .insert(campos)
    .select(SELECT_CUENTA)
    .single()

  if (error || !data) {
    if (esNombreRepetido(error)) {
      return NextResponse.json(
        { error: "Ya hay otra cuenta con ese nombre en esa moneda" },
        { status: 409 }
      )
    }
    console.error("[cuentas POST]", error)
    return NextResponse.json({ error: "No se pudo crear la cuenta" }, { status: 500 })
  }

  // Recién creada: no puede tener movimientos.
  return NextResponse.json({ cuenta: aCuentaDetalle(data, false) }, { status: 201 })
})
