import { NextResponse } from "next/server"

import { supabase } from "@/lib/supabase"
import { createSupabaseServer } from "@/lib/supabase-server"
import { POR_PAGINA_MAX } from "@/lib/admin/entidades-server"
import { esMoneda, redondear } from "@/lib/admin/moneda"
import { RETENCIONES, balancear, convertir, sumaRetenciones } from "@/lib/admin/cobros"
import { aCobro, SELECT_COBRO, type TipoPago } from "@/lib/admin/cobros-server"

/**
 * Cobros y pagos comparten tabla, forma y aritmética: los dos imputan contra
 * comprobantes, los dos mueven plata en una cuenta y los dos llevan retenciones.
 * Lo único que cambia es el signo del movimiento y contra qué maestro se valida.
 */

const CFG = {
  cobro: {
    campoEntidad: "cliente_id",
    tablaEntidad: "clientes",
    tipoComprobante: "venta",
    tipoMovimiento: "ingreso",
    clave: "cobros",
    nombre: "el cobro",
  },
  pago: {
    campoEntidad: "proveedor_id",
    tablaEntidad: "proveedores",
    tipoComprobante: "compra",
    tipoMovimiento: "egreso",
    clave: "pagos",
    nombre: "el pago",
  },
} as const

/* ── GET · listado ────────────────────────────────────────────────────────── */

export async function listarPagos(tipo: TipoPago, req: Request) {
  const cfg = CFG[tipo]
  const url = new URL(req.url)
  const pagina = Math.max(1, Number(url.searchParams.get("pagina")) || 1)
  const porPagina = Math.min(
    POR_PAGINA_MAX,
    Math.max(1, Number(url.searchParams.get("porPagina")) || 25)
  )
  const entidadId = url.searchParams.get("entidadId") ?? ""

  let query = supabase
    .from("pagos")
    .select(SELECT_COBRO, { count: "exact" })
    .eq("tipo", tipo)

  if (entidadId) query = query.eq(cfg.campoEntidad, entidadId)

  const desde = (pagina - 1) * porPagina
  const { data, error, count } = await query
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false })
    .range(desde, desde + porPagina - 1)

  if (error) {
    console.error(`[${tipo}s GET]`, error)
    return NextResponse.json({ error: `No se pudieron cargar los ${cfg.clave}` }, { status: 500 })
  }

  return NextResponse.json({
    [cfg.clave]: (data ?? []).map(aCobro),
    total: count ?? 0,
    pagina,
    porPagina,
  })
}

/* ── POST · alta ──────────────────────────────────────────────────────────── */

/**
 * Un recibo se guarda en tres inserts: la cabecera, las imputaciones y los
 * movimientos. Supabase no expone transacciones desde el cliente, así que si
 * algo falla en el medio hay que deshacer a mano — y eso es exactamente lo que
 * hace el `borrar` de abajo. Un recibo a medio guardar sería peor que ninguno:
 * dejaría facturas canceladas sin plata que las respalde.
 */
export async function crearPago(tipo: TipoPago, req: Request) {
  const cfg = CFG[tipo]

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

  /* ── Validación ───────────────────────────────────────────────────────── */

  const entidadId = typeof raw.entidadId === "string" ? raw.entidadId : ""
  if (!entidadId) {
    return NextResponse.json(
      { error: tipo === "cobro" ? "Elegí el cliente" : "Elegí el proveedor" },
      { status: 400 }
    )
  }

  const fecha = typeof raw.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.fecha)
    ? raw.fecha
    : null
  if (!fecha) return NextResponse.json({ error: "La fecha es obligatoria" }, { status: 400 })

  const moneda = esMoneda(raw.moneda) ? raw.moneda : "ARS"
  let tc = 1
  if (moneda === "USD") {
    const v = Number(raw.tc)
    if (!Number.isFinite(v) || v <= 0) {
      return NextResponse.json(
        { error: `Un ${tipo} en dólares necesita tipo de cambio` },
        { status: 400 }
      )
    }
    tc = redondear(v, 4)
  }

  const retenciones = Object.fromEntries(
    RETENCIONES.map((k) => {
      const v = Number((raw.retenciones as Record<string, unknown>)?.[k])
      return [k, Number.isFinite(v) && v > 0 ? redondear(v) : 0]
    })
  ) as Record<(typeof RETENCIONES)[number], number>

  const imputacionesRaw = Array.isArray(raw.imputaciones) ? raw.imputaciones : []
  if (imputacionesRaw.length === 0) {
    return NextResponse.json(
      { error: `Elegí al menos un comprobante para imputar ${cfg.nombre}` },
      { status: 400 }
    )
  }

  const mediosRaw = Array.isArray(raw.medios) ? raw.medios : []

  /* Las facturas: se releen de la base y no se confía en lo que manda el
     cliente. Entre que la pantalla mostró el saldo y llegó este request, otra
     persona pudo haber cobrado la misma factura. */
  const ids = imputacionesRaw
    .map((i) => (i as Record<string, unknown>).comprobanteId)
    .filter((v): v is string => typeof v === "string")

  const { data: facturas, error: errFacturas } = await supabase
    .from("comprobantes_saldo")
    .select(`id, moneda, saldo, clase, punto_venta, numero, ${cfg.campoEntidad}, tipo`)
    .in("id", ids)

  if (errFacturas) {
    console.error(`[${tipo} facturas]`, errFacturas)
    return NextResponse.json({ error: "No se pudieron verificar los comprobantes" }, { status: 500 })
  }

  const porId = new Map((facturas ?? []).map((f) => [f.id as string, f as Record<string, unknown>]))

  let imputadoEnMonedaRecibo = 0
  const filasImputacion: Record<string, unknown>[] = []

  for (const item of imputacionesRaw) {
    const i = item as Record<string, unknown>
    const id = typeof i.comprobanteId === "string" ? i.comprobanteId : ""
    const importe = Number(i.importe)

    const f = porId.get(id)
    if (!f) {
      return NextResponse.json({ error: "Uno de los comprobantes ya no existe" }, { status: 409 })
    }
    if (
      f.tipo !== cfg.tipoComprobante ||
      (f as Record<string, unknown>)[cfg.campoEntidad] !== entidadId
    ) {
      return NextResponse.json(
        {
          error:
            tipo === "cobro"
              ? "Hay una factura que no es de este cliente"
              : "Hay un comprobante que no es de este proveedor",
        },
        { status: 400 }
      )
    }
    if (!Number.isFinite(importe) || importe <= 0) {
      return NextResponse.json(
        { error: "Los importes imputados tienen que ser mayores a cero" },
        { status: 400 }
      )
    }
    // Medio centavo de tolerancia por el redondeo de la conversión.
    if (importe > Number(f.saldo) + 0.01) {
      return NextResponse.json(
        {
          error: `No se puede imputar ${importe} a ${f.clase} ${f.punto_venta}-${f.numero}: su saldo es ${f.saldo}`,
        },
        { status: 409 }
      )
    }

    filasImputacion.push({
      comprobante_id: id,
      importe: redondear(importe),
      tc_aplicado: f.moneda === moneda ? null : tc,
    })

    imputadoEnMonedaRecibo += convertir(importe, f.moneda as "ARS" | "USD", moneda, tc)
  }

  /* Los medios de pago. */
  let totalMedios = 0
  const filasMovimiento: Record<string, unknown>[] = []

  for (const item of mediosRaw) {
    const m = item as Record<string, unknown>
    const cuentaId = typeof m.cuentaId === "string" ? m.cuentaId : ""
    const importe = Number(m.importe)
    if (!cuentaId) continue
    if (!Number.isFinite(importe) || importe <= 0) continue

    totalMedios += importe
    filasMovimiento.push({
      cuenta_id: cuentaId,
      fecha,
      tipo: cfg.tipoMovimiento,
      importe: redondear(importe),
      moneda,
      tc,
      origen: tipo,
      referencia: typeof m.referencia === "string" ? m.referencia.trim() || null : null,
    })
  }

  /* El control: lo que cancela tiene que ser igual a lo que entró más las
     retenciones. Es la validación que evita el error más común del rubro —
     imputar por el total de la factura olvidando que parte se fue en retención,
     y dejar la caja descuadrada sin saber por qué. */
  const totalRetenciones = sumaRetenciones(retenciones)
  const balance = balancear(imputadoEnMonedaRecibo, totalMedios, totalRetenciones)

  if (!balance.cuadra) {
    return NextResponse.json(
      {
        error:
          `El recibo no cuadra por ${balance.diferencia.toFixed(2)}. ` +
          `Imputado ${balance.imputado.toFixed(2)}, ${tipo === "cobro" ? "cobrado" : "pagado"} ${balance.medios.toFixed(2)}, ` +
          `retenciones ${balance.retenciones.toFixed(2)}.`,
      },
      { status: 400 }
    )
  }

  /* ── Escritura ────────────────────────────────────────────────────────── */

  const supabaseUsuario = await createSupabaseServer()
  const {
    data: { user },
  } = await supabaseUsuario.auth.getUser()

  const { data: pago, error: errPago } = await supabase
    .from("pagos")
    .insert({
      tipo,
      [cfg.campoEntidad]: entidadId,
      fecha,
      moneda,
      tc,
      ret_ganancias: retenciones.ganancias,
      ret_iva: retenciones.iva,
      ret_iibb: retenciones.iibb,
      ret_suss: retenciones.suss,
      observaciones:
        typeof raw.observaciones === "string" ? raw.observaciones.trim().slice(0, 1000) || null : null,
      created_by: user?.id ?? null,
    })
    .select("id")
    .single()

  if (errPago || !pago) {
    console.error(`[${tipo} POST]`, errPago)
    return NextResponse.json({ error: `No se pudo registrar ${cfg.nombre}` }, { status: 500 })
  }

  // Deshacer a mano lo escrito hasta acá. `on delete cascade` en imputaciones y
  // movimientos hace que borrar la cabecera se lleve todo lo demás.
  const deshacer = async () => {
    await supabase.from("pagos").delete().eq("id", pago.id)
  }

  const { error: errImp } = await supabase
    .from("imputaciones")
    .insert(filasImputacion.map((f) => ({ ...f, pago_id: pago.id })))

  if (errImp) {
    await deshacer()
    console.error(`[${tipo} imputaciones]`, errImp)
    return NextResponse.json({ error: "No se pudieron imputar los comprobantes" }, { status: 500 })
  }

  if (filasMovimiento.length > 0) {
    const { error: errMov } = await supabase
      .from("movimientos")
      .insert(
        filasMovimiento.map((f) => ({ ...f, pago_id: pago.id, created_by: user?.id ?? null }))
      )

    if (errMov) {
      await deshacer()
      console.error(`[${tipo} movimientos]`, errMov)
      return NextResponse.json(
        { error: `No se pudo registrar el movimiento en la cuenta` },
        { status: 500 }
      )
    }
  }

  const { data: completo } = await supabase
    .from("pagos")
    .select(SELECT_COBRO)
    .eq("id", pago.id)
    .single()

  return NextResponse.json(
    { [tipo]: completo ? aCobro(completo) : null },
    { status: 201 }
  )
}
