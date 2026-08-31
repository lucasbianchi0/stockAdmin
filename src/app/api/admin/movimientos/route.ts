import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { createSupabaseServer } from "@/lib/supabase-server"
import { ruta } from "@/lib/admin/ruta"
import { POR_PAGINA_MAX, escaparParaOr } from "@/lib/admin/entidades-server"
import { esMoneda } from "@/lib/admin/moneda"
import { CATEGORIAS_GASTO, type CategoriaGasto } from "@/lib/admin/movimientos"
import {
  SELECT_MOVIMIENTO,
  aMovimiento,
  esFechaISO,
  monedasDeCuentas,
  numeroPositivo,
  resolverImporte,
  textoCorto,
} from "@/lib/admin/movimientos-server"
import { cotizacionHasta } from "@/lib/admin/cotizaciones-server"

/* ── GET · listado ────────────────────────────────────────────────────────── */

export const GET = ruta("movimientos GET", async (req: Request) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso

  const url = new URL(req.url)
  const pagina = Math.max(1, Number(url.searchParams.get("pagina")) || 1)
  const porPagina = Math.min(
    POR_PAGINA_MAX,
    Math.max(1, Number(url.searchParams.get("porPagina")) || 25)
  )
  const cuentaId = url.searchParams.get("cuentaId") ?? ""
  const origen = url.searchParams.get("origen") ?? ""
  const desdeFecha = url.searchParams.get("desde") ?? ""
  const hastaFecha = url.searchParams.get("hasta") ?? ""
  const conciliado = url.searchParams.get("conciliado") ?? ""
  const q = url.searchParams.get("q")?.trim() ?? ""
  /**
   * Solo los movimientos que no cuelgan de un recibo.
   *
   * Es la definición que da el pliego de "otros movimientos": «todo movimiento
   * de dinero que no sea a través de facturas». No se puede armar filtrando por
   * `origen`, porque son tres —gasto, transferencia y manual— y el filtro es por
   * uno solo; y sobre todo porque la pregunta real no es de qué tipo es, sino si
   * alguien lo tipeó a mano o lo generó un cobro o un pago.
   */
  const sueltos = url.searchParams.get("sueltos") === "1"

  let query = supabase.from("movimientos").select(SELECT_MOVIMIENTO, { count: "exact" })

  if (cuentaId) query = query.eq("cuenta_id", cuentaId)
  if (origen) query = query.eq("origen", origen)
  if (sueltos) query = query.is("pago_id", null)
  if (desdeFecha) query = query.gte("fecha", desdeFecha)
  if (hastaFecha) query = query.lte("fecha", hastaFecha)
  if (conciliado === "si") query = query.eq("conciliado", true)
  if (conciliado === "no") query = query.eq("conciliado", false)
  if (q) {
    const texto = escaparParaOr(q)
    query = query.or(`detalle.ilike.%${texto}%,referencia.ilike.%${texto}%`)
  }

  const desde = (pagina - 1) * porPagina
  const { data, error, count } = await query
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false })
    .range(desde, desde + porPagina - 1)

  if (error) {
    console.error("[movimientos GET]", error)
    return NextResponse.json({ error: "No se pudieron cargar los movimientos" }, { status: 500 })
  }

  return NextResponse.json({
    movimientos: (data ?? []).map(aMovimiento),
    total: count ?? 0,
    pagina,
    porPagina,
  })
})

/* ── POST · gasto, ajuste o transferencia ─────────────────────────────────── */

/**
 * Tres formas distintas bajo un solo endpoint, según `origen`:
 *
 *  · `gasto` / `manual` — un movimiento suelto en una cuenta.
 *  · `transferencia` — dos movimientos hermanos, egreso en una cuenta e ingreso
 *    en otra. Se escriben juntos y comparten `referencia` para poder emparejarlos
 *    después; si el segundo falla, se borra el primero. Media transferencia es
 *    peor que ninguna: hace desaparecer plata.
 */
export const POST = ruta("movimientos POST", async (req: Request) => {
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

  const raw = body as Record<string, unknown>
  const origen = typeof raw.origen === "string" ? raw.origen : "manual"

  const fecha = esFechaISO(raw.fecha) ? raw.fecha : null
  if (!fecha) return NextResponse.json({ error: "La fecha es obligatoria" }, { status: 400 })

  const supabaseUsuario = await createSupabaseServer()
  const {
    data: { user },
  } = await supabaseUsuario.auth.getUser()
  const creador = user?.id ?? null

  /* ── Transferencia entre cuentas propias ──────────────────────────────── */

  if (origen === "transferencia") {
    const cuentaOrigen = typeof raw.cuentaOrigenId === "string" ? raw.cuentaOrigenId : ""
    const cuentaDestino = typeof raw.cuentaDestinoId === "string" ? raw.cuentaDestinoId : ""

    if (!cuentaOrigen || !cuentaDestino) {
      return NextResponse.json({ error: "Elegí las dos cuentas" }, { status: 400 })
    }
    if (cuentaOrigen === cuentaDestino) {
      return NextResponse.json(
        { error: "La cuenta de origen y la de destino tienen que ser distintas" },
        { status: 400 }
      )
    }

    const importeSale = numeroPositivo(raw.importeOrigen)
    // El importe que llega puede diferir del que sale: es lo que pasa al comprar
    // dólares. Si no lo mandan, se asume que es el mismo.
    const importeEntra = numeroPositivo(raw.importeDestino) ?? importeSale

    if (importeSale === null || importeEntra === null) {
      return NextResponse.json({ error: "Los importes tienen que ser mayores a cero" }, { status: 400 })
    }

    // Las monedas las dicen las cuentas, no el formulario. Es lo que hace que
    // una compra de dólares —pesos que salen del Galicia, dólares que entran a
    // la cuenta en USD— se registre bien de los dos lados sin que nadie elija
    // nada.
    const monedas = await monedasDeCuentas([cuentaOrigen, cuentaDestino])
    const monedaOrigen = monedas.get(cuentaOrigen)
    const monedaDestino = monedas.get(cuentaDestino)

    if (!monedaOrigen || !monedaDestino) {
      return NextResponse.json({ error: "Alguna de las cuentas elegidas ya no existe" }, { status: 409 })
    }

    // Con las dos patas en monedas distintas el TC no es opcional: es el precio
    // al que se compraron o vendieron los dólares, y sin él la operación no se
    // puede valuar ni explicar después.
    let tc = numeroPositivo(raw.tc)
    if (monedaOrigen !== monedaDestino && tc === null) {
      return NextResponse.json(
        { error: "Una transferencia entre cuentas en monedas distintas necesita tipo de cambio" },
        { status: 400 }
      )
    }
    if (tc === null) tc = await cotizacionHasta(fecha)

    const referencia = textoCorto(raw.referencia) ?? `Transferencia ${fecha}`
    const detalle = textoCorto(raw.detalle)

    const { data: salida, error: errSalida } = await supabase
      .from("movimientos")
      .insert({
        cuenta_id: cuentaOrigen,
        fecha,
        tipo: "egreso",
        importe: importeSale,
        moneda: monedaOrigen,
        tc,
        origen: "transferencia",
        referencia,
        detalle,
        created_by: creador,
      })
      .select("id")
      .single()

    if (errSalida || !salida) {
      console.error("[transferencia salida]", errSalida)
      return NextResponse.json({ error: "No se pudo registrar la salida" }, { status: 500 })
    }

    const { error: errEntrada } = await supabase.from("movimientos").insert({
      cuenta_id: cuentaDestino,
      fecha,
      tipo: "ingreso",
      importe: importeEntra,
      moneda: monedaDestino,
      tc,
      origen: "transferencia",
      referencia,
      detalle,
      created_by: creador,
    })

    if (errEntrada) {
      // Deshacer: media transferencia hace desaparecer plata del sistema.
      await supabase.from("movimientos").delete().eq("id", salida.id)
      console.error("[transferencia entrada]", errEntrada)
      return NextResponse.json({ error: "No se pudo registrar la entrada" }, { status: 500 })
    }

    return NextResponse.json({ ok: true }, { status: 201 })
  }

  /* ── Gasto o ajuste ───────────────────────────────────────────────────── */

  const cuentaId = typeof raw.cuentaId === "string" ? raw.cuentaId : ""
  if (!cuentaId) return NextResponse.json({ error: "Elegí la cuenta" }, { status: 400 })

  const importe = numeroPositivo(raw.importe)
  if (importe === null) {
    return NextResponse.json({ error: "El importe tiene que ser mayor a cero" }, { status: 400 })
  }

  const tipo = raw.tipo === "ingreso" ? "ingreso" : "egreso"

  // La moneda de la cuenta manda. Si el importe se cargó en otra —un gasto en
  // dólares que se paga desde la cuenta en pesos— se convierte acá y se guarda
  // de dónde salió, para que el extracto pueda explicar el renglón.
  const monedaCuenta = (await monedasDeCuentas([cuentaId])).get(cuentaId)
  if (!monedaCuenta) {
    return NextResponse.json({ error: "La cuenta elegida ya no existe" }, { status: 409 })
  }

  const plata = await resolverImporte({
    importe,
    monedaCargada: esMoneda(raw.moneda) ? raw.moneda : monedaCuenta,
    monedaCuenta,
    tc: numeroPositivo(raw.tc),
    fecha,
  })
  if ("error" in plata) return NextResponse.json({ error: plata.error }, { status: 400 })

  const categoria =
    typeof raw.categoria === "string" &&
    (CATEGORIAS_GASTO as readonly string[]).includes(raw.categoria)
      ? (raw.categoria as CategoriaGasto)
      : null

  const { data, error } = await supabase
    .from("movimientos")
    .insert({
      cuenta_id: cuentaId,
      fecha,
      tipo,
      importe: plata.importe,
      moneda: plata.moneda,
      // Sin cotización se omite y manda el default de la columna: es un
      // movimiento en pesos, donde el TC no cambia ninguna valuación.
      ...(plata.tc !== null && { tc: plata.tc }),
      importe_origen: plata.importeOrigen,
      moneda_origen: plata.monedaOrigen,
      origen: origen === "gasto" ? "gasto" : "manual",
      cuenta_contable_id:
        typeof raw.cuentaContableId === "string" && raw.cuentaContableId
          ? raw.cuentaContableId
          : null,
      referencia: textoCorto(raw.referencia),
      detalle: textoCorto(raw.detalle, 500),
      categoria,
      created_by: creador,
    })
    .select(SELECT_MOVIMIENTO)
    .single()

  if (error) {
    console.error("[movimientos POST]", error)
    return NextResponse.json({ error: "No se pudo registrar el movimiento" }, { status: 500 })
  }

  return NextResponse.json({ movimiento: aMovimiento(data) }, { status: 201 })
})
