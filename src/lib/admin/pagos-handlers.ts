import { NextResponse } from "next/server"

import { supabase } from "@/lib/supabase"
import { createSupabaseServer } from "@/lib/supabase-server"
import { POR_PAGINA_MAX } from "@/lib/admin/entidades-server"
import { esMoneda, redondear } from "@/lib/admin/moneda"
import {
  RETENCIONES,
  balancear,
  convertir,
  esJurisdiccion,
  sumaRetenciones,
} from "@/lib/admin/cobros"
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

  /**
   * El TC del recibo.
   *
   * Acá estaba el punto 5 del pedido. El código forzaba `tc = 1` cuando el
   * recibo era en pesos, y unas líneas más abajo `convertir()` usa ese TC para
   * pasar lo que cancela cada factura a la moneda del recibo. Con TC 1, una
   * factura de USD 3.263,50 se contaba como $ 3.263,50 y el control de cuadratura
   * fallaba siempre — el mensaje del screenshot: "el recibo no cuadra por
   * 4.679.859,00. Imputado 3.263,50, cobrado 4.097.373,69".
   *
   * Lo que decide si hace falta el TC no es la moneda del recibo: es si el
   * recibo y alguna de las facturas que cancela están en monedas distintas.
   * Cobrar en pesos una factura en dólares es lo normal —el cliente transfiere
   * pesos— y tiene que poder hacerse.
   */
  const tcCrudo = Number(raw.tc)
  const tc = Number.isFinite(tcCrudo) && tcCrudo > 0 ? redondear(tcCrudo, 4) : null

  /**
   * Las retenciones, ahora como renglones.
   *
   * Antes eran cuatro números fijos —ganancias, iva, iibb, suss— y por eso no
   * había dónde poner la provincia: el punto 4 del pedido. Ahora cada una es una
   * fila con su tipo, su jurisdicción (solo IIBB), su cuenta contable y su
   * certificado, y un mismo recibo puede llevar IIBB de CABA y de Buenos Aires
   * como dos renglones distintos.
   */
  const retenciones: Record<string, unknown>[] = []

  for (const item of Array.isArray(raw.retenciones) ? raw.retenciones : []) {
    const r = item as Record<string, unknown>
    const tipoRet = typeof r.tipo === "string" ? r.tipo : ""
    if (!(RETENCIONES as readonly string[]).includes(tipoRet)) continue

    const importeRet = Number(r.importe)
    // Un renglón en cero no es una retención: es un campo que quedó vacío. Se
    // descarta acá para que no llegue a la base a chocar contra el check.
    if (!Number.isFinite(importeRet) || importeRet <= 0) continue

    const jurisdiccion =
      tipoRet === "iibb" && esJurisdiccion(r.jurisdiccion) ? r.jurisdiccion : null

    if (tipoRet === "iibb" && jurisdiccion === null) {
      return NextResponse.json(
        { error: "Elegí la jurisdicción de la retención de Ingresos Brutos" },
        { status: 400 }
      )
    }

    const base = Number(r.base)
    const alicuota = Number(r.alicuota)

    retenciones.push({
      tipo: tipoRet,
      jurisdiccion,
      importe: redondear(importeRet),
      cuenta_contable_id:
        typeof r.cuentaContableId === "string" && r.cuentaContableId ? r.cuentaContableId : null,
      base: Number.isFinite(base) && base > 0 ? redondear(base) : null,
      alicuota: Number.isFinite(alicuota) && alicuota > 0 ? redondear(alicuota, 4) : null,
      numero_certificado:
        typeof r.numeroCertificado === "string" ? r.numeroCertificado.trim().slice(0, 60) || null : null,
    })
  }

  // Dos renglones del mismo tipo y jurisdicción son dos importes que habría que
  // sumar a mano. La base lo impide con un índice único; acá se avisa antes, con
  // un mensaje que dice cuál.
  const claves = new Set<string>()
  for (const r of retenciones) {
    const clave = `${r.tipo}·${r.jurisdiccion ?? ""}`
    if (claves.has(clave)) {
      return NextResponse.json(
        { error: "Hay dos retenciones del mismo tipo y jurisdicción: juntalas en un solo renglón" },
        { status: 400 }
      )
    }
    claves.add(clave)
  }

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

  // Si alguna factura está en otra moneda que el recibo, el TC deja de ser
  // opcional: sin él no hay forma de saber cuánto de lo que entró cancela cada
  // una. Se chequea antes de recorrerlas para dar un mensaje entendible en vez
  // de un "no cuadra por 4.679.859".
  const hayMonedaCruzada = (facturas ?? []).some((f) => f.moneda !== moneda)
  if (hayMonedaCruzada && tc === null) {
    return NextResponse.json(
      {
        error:
          `Estás ${tipo === "cobro" ? "cobrando" : "pagando"} en ${moneda === "ARS" ? "pesos" : "dólares"} ` +
          `un comprobante en ${moneda === "ARS" ? "dólares" : "pesos"}: cargá el tipo de cambio.`,
      },
      { status: 400 }
    )
  }

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

    // `tc ?? 0` y no `?? 1`: si por algún camino llegara acá sin TC teniendo
    // monedas distintas, la conversión da cero y el control de cuadratura de
    // abajo lo frena con un error. Un 1 lo dejaría pasar con el importe
    // equivocado, que es exactamente el bug que se está arreglando.
    imputadoEnMonedaRecibo += convertir(importe, f.moneda as "ARS" | "USD", moneda, tc ?? 0)
  }

  /* Los medios de pago.
   *
   * Cada movimiento se guarda en la moneda de SU cuenta, no en la del recibo: un
   * Banco Galicia en pesos no puede recibir dólares, igual que en el banco de
   * verdad. Era el punto 6 — "el saldo del Galicia no refleja el saldo real
   * porque muestra una parte en USD y una en Pesos". La base ahora lo garantiza
   * con un trigger; acá se hace la conversión para que nunca llegue a saltar. */
  const cuentaIds = mediosRaw
    .map((m) => (m as Record<string, unknown>).cuentaId)
    .filter((v): v is string => typeof v === "string" && v.length > 0)

  const { data: cuentasMedio } = await supabase
    .from("cuentas_financieras")
    .select("id, nombre, moneda")
    .in("id", cuentaIds.length > 0 ? cuentaIds : ["00000000-0000-0000-0000-000000000000"])

  const monedaDeCuenta = new Map(
    (cuentasMedio ?? []).map((c) => [c.id as string, c.moneda as "ARS" | "USD"])
  )

  let totalMedios = 0
  const filasMovimiento: Record<string, unknown>[] = []

  for (const item of mediosRaw) {
    const m = item as Record<string, unknown>
    const cuentaId = typeof m.cuentaId === "string" ? m.cuentaId : ""
    const importe = Number(m.importe)
    if (!cuentaId) continue
    if (!Number.isFinite(importe) || importe <= 0) continue

    const monedaCuenta = monedaDeCuenta.get(cuentaId)
    if (!monedaCuenta) {
      return NextResponse.json({ error: "Una de las cuentas elegidas ya no existe" }, { status: 409 })
    }

    // El control de cuadratura corre en la moneda del recibo, así que suma el
    // importe tal como se cargó. Lo convertido es lo que se guarda.
    totalMedios += importe

    const cruzada = monedaCuenta !== moneda
    if (cruzada && tc === null) {
      return NextResponse.json(
        { error: `La cuenta elegida está en ${monedaCuenta} y el recibo en ${moneda}: cargá el tipo de cambio.` },
        { status: 400 }
      )
    }

    filasMovimiento.push({
      cuenta_id: cuentaId,
      fecha,
      tipo: cfg.tipoMovimiento,
      importe: cruzada
        ? convertir(importe, moneda, monedaCuenta, tc ?? 0)
        : redondear(importe),
      moneda: monedaCuenta,
      tc,
      // De dónde salió, para que el extracto del banco y el recibo se puedan
      // explicar el uno al otro. Sin esto, un cobro de USD 2.855,31 acreditado
      // en pesos pierde para siempre el dato de que eran dólares.
      importe_origen: cruzada ? redondear(importe) : null,
      moneda_origen: cruzada ? moneda : null,
      origen: tipo,
      referencia: typeof m.referencia === "string" ? m.referencia.trim() || null : null,
    })
  }

  /* El control: lo que cancela tiene que ser igual a lo que entró más las
     retenciones. Es la validación que evita el error más común del rubro —
     imputar por el total de la factura olvidando que parte se fue en retención,
     y dejar la caja descuadrada sin saber por qué. */
  const totalRetenciones = sumaRetenciones(
    retenciones.map((r) => ({ importe: Number(r.importe) }))
  )
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

  if (retenciones.length > 0) {
    const { error: errRet } = await supabase
      .from("pago_retenciones")
      .insert(retenciones.map((r) => ({ ...r, pago_id: pago.id })))

    if (errRet) {
      await deshacer()
      console.error(`[${tipo} retenciones]`, errRet)
      return NextResponse.json({ error: "No se pudieron registrar las retenciones" }, { status: 500 })
    }
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
