import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { ruta } from "@/lib/admin/ruta"
import { escaparParaOr } from "@/lib/admin/entidades-server"
import { redondear } from "@/lib/admin/moneda"
import type { CategoriaGasto, OrigenMovimiento } from "@/lib/admin/movimientos"
import {
  conceptoDe,
  type Extracto,
  type FilaExtracto,
} from "@/lib/admin/extracto"

/**
 * El extracto de una caja o de un banco, con el formato del resumen bancario.
 *
 * La decisión que lo hace útil: **el saldo corre desde el saldo real de la
 * cuenta, no desde cero**. Antes de traer las filas del período se pregunta
 * cuánto había justo antes de que empezara —el saldo inicial de la cuenta más
 * todo lo anterior— y desde ahí se acumula. Un extracto de agosto que arranca
 * en cero no se puede comparar contra el resumen del banco, que es para lo único
 * que sirve un extracto.
 *
 * El saldo se acumula acá y no en la base porque PostgREST no expone funciones
 * de ventana. Es una pasada sobre las filas del período, que ya están en
 * memoria.
 */

/** Techo de filas. Con más movimientos que esto en un período, el saldo corrido
 *  seguiría siendo correcto pero la pantalla dejaría de ser legible; se avisa
 *  que se cortó en vez de mentir con un total parcial. */
const TOPE = 2000

export const GET = ruta("extracto GET", async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso

  const { id } = await ctx.params
  const url = new URL(req.url)
  const desde = url.searchParams.get("desde") ?? ""
  const hasta = url.searchParams.get("hasta") ?? ""
  const origen = url.searchParams.get("origen") ?? ""
  const conciliado = url.searchParams.get("conciliado") ?? ""
  const q = url.searchParams.get("q")?.trim() ?? ""

  /* ── La cuenta ────────────────────────────────────────────────────────── */

  const { data: cuenta, error: errCuenta } = await supabase
    .from("cuentas_saldo")
    .select("id, nombre, tipo, moneda, banco, numero_cuenta, cbu, alias, saldo, saldo_inicial")
    .eq("id", id)
    .maybeSingle()

  if (errCuenta) {
    console.error("[extracto cuenta]", errCuenta)
    return NextResponse.json({ error: "No se pudo cargar la cuenta" }, { status: 500 })
  }
  if (!cuenta) return NextResponse.json({ error: "La cuenta no existe" }, { status: 404 })

  /* ── Lo que había antes del período ───────────────────────────────────── */

  // El arranque del saldo corrido. Sin el `desde` no hay nada anterior y el
  // arranque es el saldo inicial de la cuenta a secas.
  let arranque = Number(cuenta.saldo_inicial ?? 0)

  if (desde) {
    const { data: previos, error: errPrevios } = await supabase
      .from("movimientos")
      .select("importe, signo")
      .eq("cuenta_id", id)
      .lt("fecha", desde)

    if (errPrevios) {
      console.error("[extracto previos]", errPrevios)
      return NextResponse.json({ error: "No se pudo calcular el saldo inicial" }, { status: 500 })
    }

    arranque = (previos ?? []).reduce(
      (acc, m) => acc + Number(m.importe) * Number(m.signo),
      arranque
    )
  }

  arranque = redondear(arranque)

  /* ── Las filas del período ────────────────────────────────────────────── */

  let query = supabase
    .from("movimientos")
    .select(
      `id, fecha, importe, signo, origen, categoria, referencia, detalle,
       conciliado, pago_id, importe_origen, moneda_origen,
       contable:plan_cuentas (codigo, nombre)`
    )
    .eq("cuenta_id", id)

  if (desde) query = query.gte("fecha", desde)
  if (hasta) query = query.lte("fecha", hasta)
  if (origen) query = query.eq("origen", origen)
  if (conciliado === "si") query = query.eq("conciliado", true)
  if (conciliado === "no") query = query.eq("conciliado", false)
  if (q) {
    const texto = escaparParaOr(q)
    query = query.or(`detalle.ilike.%${texto}%,referencia.ilike.%${texto}%`)
  }

  // Ascendente: el saldo de cada fila es el acumulado hasta ahí, y eso solo
  // tiene sentido leído del más viejo al más nuevo.
  //
  // Los tres criterios de orden hacen falta. `created_at` desempata las del
  // mismo día, y el `id` desempata las que además comparten `created_at` — pasa
  // cuando varios movimientos entran en el mismo INSERT, que es exactamente lo
  // que hace un recibo con dos medios de pago. Sin el tercer criterio, dos
  // consultas iguales pueden devolver las filas en distinto orden y la columna
  // de saldo cambia de una recarga a la otra sin que nada haya cambiado.
  const { data, error } = await query
    .order("fecha", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(TOPE)

  if (error) {
    console.error("[extracto movimientos]", error)
    return NextResponse.json({ error: "No se pudo cargar el extracto" }, { status: 500 })
  }

  let corrido = arranque
  let debitos = 0
  let creditos = 0
  let sinConciliar = 0

  const filas: FilaExtracto[] = (data ?? []).map((m) => {
    const importe = Number(m.importe)
    const entra = Number(m.signo) === 1
    const contable = m.contable as unknown as { codigo: string; nombre: string } | null

    if (entra) creditos += importe
    else debitos += importe
    if (!m.conciliado) sinConciliar++

    corrido = redondear(corrido + (entra ? importe : -importe))

    return {
      id: m.id as string,
      fecha: m.fecha as string,
      concepto: conceptoDe(
        m.origen as OrigenMovimiento,
        (m.categoria as CategoriaGasto | null) ?? null,
        entra ? "ingreso" : "egreso"
      ),
      detalle: (m.detalle as string | null) ?? null,
      referencia: (m.referencia as string | null) ?? null,
      debito: entra ? 0 : importe,
      credito: entra ? importe : 0,
      saldo: corrido,
      origen: m.origen as OrigenMovimiento,
      conciliado: Boolean(m.conciliado),
      cuentaContableNombre: contable ? `${contable.codigo} · ${contable.nombre}` : null,
      importeOrigen: m.importe_origen === null ? null : Number(m.importe_origen),
      monedaOrigen: (m.moneda_origen as "ARS" | "USD" | null) ?? null,
      pagoId: (m.pago_id as string | null) ?? null,
    }
  })

  const extracto: Extracto = {
    cuenta: {
      id: cuenta.id as string,
      nombre: cuenta.nombre as string,
      tipo: cuenta.tipo as Extracto["cuenta"]["tipo"],
      moneda: cuenta.moneda as Extracto["cuenta"]["moneda"],
      banco: (cuenta.banco as string | null) ?? null,
      numeroCuenta: (cuenta.numero_cuenta as string | null) ?? null,
      cbu: (cuenta.cbu as string | null) ?? null,
      alias: (cuenta.alias as string | null) ?? null,
      saldoActual: Number(cuenta.saldo),
    },
    periodo: {
      desde: desde || null,
      hasta: hasta || null,
      saldoInicial: arranque,
      debitos: redondear(debitos),
      creditos: redondear(creditos),
      saldoFinal: corrido,
      cantidad: filas.length,
      sinConciliar,
      truncado: filas.length >= TOPE,
    },
    filas,
  }

  return NextResponse.json(extracto)
})
