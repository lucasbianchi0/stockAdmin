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

/* ── Validación, compartida por el alta y la edición ──────────────────────── */

/**
 * Todo lo que hay que chequear antes de escribir un recibo.
 *
 * Está afuera de `crearPago` porque editar un recibo valida exactamente lo
 * mismo: las mismas facturas, el mismo control de cuadratura, las mismas
 * conversiones de moneda. La única diferencia es `pagoId`, que al editar hace
 * que el saldo de cada factura ignore lo que este recibo ya le había imputado.
 */
type PiezasPago = {
  cabecera: Record<string, unknown>
  imputaciones: Record<string, unknown>[]
  retenciones: Record<string, unknown>[]
  movimientos: Record<string, unknown>[]
}

async function validarPago(
  tipo: TipoPago,
  raw: Record<string, unknown>,
  pagoId: string | null
): Promise<{ piezas: PiezasPago } | { respuesta: NextResponse }> {
  const cfg = CFG[tipo]

  /* ── Validación ───────────────────────────────────────────────────────── */

  const entidadId = typeof raw.entidadId === "string" ? raw.entidadId : ""
  if (!entidadId) {
    return { respuesta: NextResponse.json(
      { error: tipo === "cobro" ? "Elegí el cliente" : "Elegí el proveedor" },
      { status: 400 }
    ) }
  }

  const fecha = typeof raw.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.fecha)
    ? raw.fecha
    : null
  if (!fecha) return { respuesta: NextResponse.json({ error: "La fecha es obligatoria" }, { status: 400 }) }

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
      return { respuesta: NextResponse.json(
        { error: "Elegí la jurisdicción de la retención de Ingresos Brutos" },
        { status: 400 }
      ) }
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
      return { respuesta: NextResponse.json(
        { error: "Hay dos retenciones del mismo tipo y jurisdicción: juntalas en un solo renglón" },
        { status: 400 }
      ) }
    }
    claves.add(clave)
  }

  const imputacionesRaw = Array.isArray(raw.imputaciones) ? raw.imputaciones : []
  if (imputacionesRaw.length === 0) {
    return { respuesta: NextResponse.json(
      { error: `Elegí al menos un comprobante para imputar ${cfg.nombre}` },
      { status: 400 }
    ) }
  }

  const mediosRaw = Array.isArray(raw.medios) ? raw.medios : []

  /* Las facturas: se releen de la base y no se confía en lo que manda el
     cliente. Entre que la pantalla mostró el saldo y llegó este request, otra
     persona pudo haber cobrado la misma factura. */
  const ids = imputacionesRaw
    .map((i) => (i as Record<string, unknown>).comprobanteId)
    .filter((v): v is string => typeof v === "string")

  const { data: facturas, error: errFacturas } = await supabase
    .from("comprobantes_vigentes")
    .select(`id, moneda, saldo, clase, punto_venta, numero, ${cfg.campoEntidad}, tipo`)
    .in("id", ids)

  /**
   * Lo que este mismo recibo ya tenía imputado, al editarlo.
   *
   * Sin esto, abrir un recibo que canceló una factura entera y guardarlo sin
   * cambiar nada daría "no se puede imputar 4.683.122,50: su saldo es 0". El
   * saldo de la factura ya descuenta lo que este recibo le imputó, así que para
   * validar la versión nueva hay que devolvérselo.
   */
  const yaImputado = new Map<string, number>()
  if (pagoId) {
    const { data: previas } = await supabase
      .from("imputaciones")
      .select("comprobante_id, importe")
      .eq("pago_id", pagoId)

    for (const i of previas ?? []) {
      const cid = i.comprobante_id as string
      yaImputado.set(cid, (yaImputado.get(cid) ?? 0) + Number(i.importe))
    }
  }

  if (errFacturas) {
    console.error(`[${tipo} facturas]`, errFacturas)
    return { respuesta: NextResponse.json({ error: "No se pudieron verificar los comprobantes" }, { status: 500 }) }
  }

  const porId = new Map((facturas ?? []).map((f) => [f.id as string, f as Record<string, unknown>]))

  // Si alguna factura está en otra moneda que el recibo, el TC deja de ser
  // opcional: sin él no hay forma de saber cuánto de lo que entró cancela cada
  // una. Se chequea antes de recorrerlas para dar un mensaje entendible en vez
  // de un "no cuadra por 4.679.859".
  const hayMonedaCruzada = (facturas ?? []).some((f) => f.moneda !== moneda)
  if (hayMonedaCruzada && tc === null) {
    return { respuesta: NextResponse.json(
      {
        error:
          `Estás ${tipo === "cobro" ? "cobrando" : "pagando"} en ${moneda === "ARS" ? "pesos" : "dólares"} ` +
          `un comprobante en ${moneda === "ARS" ? "dólares" : "pesos"}: cargá el tipo de cambio.`,
      },
      { status: 400 }
    ) }
  }

  let imputadoEnMonedaRecibo = 0
  const filasImputacion: Record<string, unknown>[] = []

  for (const item of imputacionesRaw) {
    const i = item as Record<string, unknown>
    const id = typeof i.comprobanteId === "string" ? i.comprobanteId : ""
    const importe = Number(i.importe)

    const f = porId.get(id)
    if (!f) {
      return { respuesta: NextResponse.json({ error: "Uno de los comprobantes ya no existe" }, { status: 409 }) }
    }
    if (
      f.tipo !== cfg.tipoComprobante ||
      (f as Record<string, unknown>)[cfg.campoEntidad] !== entidadId
    ) {
      return { respuesta: NextResponse.json(
        {
          error:
            tipo === "cobro"
              ? "Hay una factura que no es de este cliente"
              : "Hay un comprobante que no es de este proveedor",
        },
        { status: 400 }
      ) }
    }
    if (!Number.isFinite(importe) || importe <= 0) {
      return { respuesta: NextResponse.json(
        { error: "Los importes imputados tienen que ser mayores a cero" },
        { status: 400 }
      ) }
    }
    // Medio centavo de tolerancia por el redondeo de la conversión.
    const disponible = Number(f.saldo) + (yaImputado.get(id) ?? 0)
    if (importe > disponible + 0.01) {
      return { respuesta: NextResponse.json(
        {
          error: `No se puede imputar ${importe} a ${f.clase} ${f.punto_venta}-${f.numero}: su saldo es ${disponible.toFixed(2)}`,
        },
        { status: 409 }
      ) }
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
      return { respuesta: NextResponse.json({ error: "Una de las cuentas elegidas ya no existe" }, { status: 409 }) }
    }

    // El control de cuadratura corre en la moneda del recibo, así que suma el
    // importe tal como se cargó. Lo convertido es lo que se guarda.
    totalMedios += importe

    const cruzada = monedaCuenta !== moneda
    if (cruzada && tc === null) {
      return { respuesta: NextResponse.json(
        { error: `La cuenta elegida está en ${monedaCuenta} y el recibo en ${moneda}: cargá el tipo de cambio.` },
        { status: 400 }
      ) }
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
    return { respuesta: NextResponse.json(
      {
        error:
          `El recibo no cuadra por ${balance.diferencia.toFixed(2)}. ` +
          `Imputado ${balance.imputado.toFixed(2)}, ${tipo === "cobro" ? "cobrado" : "pagado"} ${balance.medios.toFixed(2)}, ` +
          `retenciones ${balance.retenciones.toFixed(2)}.`,
      },
      { status: 400 }
    ) }
  }


  return {
    piezas: {
      cabecera: {
        tipo,
        [cfg.campoEntidad]: entidadId,
        fecha,
        moneda,
        tc,
        observaciones:
          typeof raw.observaciones === "string"
            ? raw.observaciones.trim().slice(0, 1000) || null
            : null,
      },
      imputaciones: filasImputacion,
      retenciones,
      movimientos: filasMovimiento,
    },
  }
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

  const validado = await validarPago(tipo, raw, null)
  if ("respuesta" in validado) return validado.respuesta
  const { cabecera, imputaciones: filasImputacion, retenciones, movimientos: filasMovimiento } = validado.piezas

  /* ── Escritura ────────────────────────────────────────────────────────── */

  const supabaseUsuario = await createSupabaseServer()
  const {
    data: { user },
  } = await supabaseUsuario.auth.getUser()

  const { data: pago, error: errPago } = await supabase
    .from("pagos")
    .insert({ ...cabecera, created_by: user?.id ?? null })
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

/* ── PATCH · edición ──────────────────────────────────────────────────────── */

/**
 * Editar un recibo ya cargado.
 *
 * Hasta ahora la única forma de corregir un cobro mal cargado era borrarlo y
 * rehacerlo entero: volver a buscar el cliente, volver a tildar las facturas,
 * volver a escribir las retenciones. Por un dígito mal tipeado en el número de
 * transferencia.
 *
 * CÓMO SE HACE SIN TRANSACCIONES
 *
 * Un recibo son cuatro tablas y Supabase no expone transacciones desde el
 * cliente, así que "reemplazar los hijos" puede fallar por la mitad. La
 * secuencia de abajo hace que eso no pierda datos:
 *
 *   1. Se valida la versión nueva **entera** antes de tocar nada. Si algo no
 *      cierra, el recibo viejo sigue intacto y nadie se enteró.
 *   2. Se guarda una copia en memoria de los hijos actuales.
 *   3. Se borran y se insertan los nuevos.
 *   4. Si algo falla, se reponen los de la copia.
 *
 * El id del recibo no cambia, que es lo que hace que los enlaces desde el
 * extracto del banco sigan funcionando.
 */
export async function editarPago(tipo: TipoPago, req: Request, id: string) {
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

  const { data: existente } = await supabase
    .from("pagos")
    .select("id")
    .eq("id", id)
    .eq("tipo", tipo)
    .maybeSingle()

  if (!existente) {
    return NextResponse.json({ error: `No se encontró ${cfg.nombre}` }, { status: 404 })
  }

  // 1 · Validar la versión nueva. `id` como tercer argumento es lo que hace que
  // el saldo de cada factura ignore lo que este mismo recibo ya le imputaba.
  const validado = await validarPago(tipo, body as Record<string, unknown>, id)
  if ("respuesta" in validado) return validado.respuesta

  const { cabecera, imputaciones, retenciones, movimientos } = validado.piezas

  // 2 · La copia de seguridad de los hijos actuales.
  const [{ data: impPrevias }, { data: retPrevias }, { data: movPrevios }] = await Promise.all([
    supabase.from("imputaciones").select("*").eq("pago_id", id),
    supabase.from("pago_retenciones").select("*").eq("pago_id", id),
    supabase.from("movimientos").select("*").eq("pago_id", id),
  ])

  const reponer = async () => {
    await Promise.all([
      supabase.from("imputaciones").delete().eq("pago_id", id),
      supabase.from("pago_retenciones").delete().eq("pago_id", id),
      supabase.from("movimientos").delete().eq("pago_id", id),
    ])
    // Sin las columnas generadas, que Postgres rechaza en un INSERT.
    const limpiar = (filas: Record<string, unknown>[] | null) =>
      (filas ?? []).map((f) => {
        const copia = { ...f }
        delete copia.signo
        delete copia.importe_ars
        delete copia.importe_usd
        return copia
      })

    await Promise.all([
      impPrevias?.length ? supabase.from("imputaciones").insert(impPrevias) : null,
      retPrevias?.length ? supabase.from("pago_retenciones").insert(retPrevias) : null,
      movPrevios?.length ? supabase.from("movimientos").insert(limpiar(movPrevios)) : null,
    ])
  }

  // 3 · Fuera lo viejo, adentro lo nuevo.
  const borrados = await Promise.all([
    supabase.from("imputaciones").delete().eq("pago_id", id),
    supabase.from("pago_retenciones").delete().eq("pago_id", id),
    supabase.from("movimientos").delete().eq("pago_id", id),
  ])

  const errBorrado = borrados.find((r) => r.error)?.error
  if (errBorrado) {
    console.error(`[${tipo} PATCH borrado]`, errBorrado)
    await reponer()
    return NextResponse.json({ error: `No se pudo actualizar ${cfg.nombre}` }, { status: 500 })
  }

  const supabaseUsuario = await createSupabaseServer()
  const {
    data: { user },
  } = await supabaseUsuario.auth.getUser()

  const { error: errCabecera } = await supabase
    .from("pagos")
    .update(cabecera)
    .eq("id", id)

  if (errCabecera) {
    console.error(`[${tipo} PATCH cabecera]`, errCabecera)
    await reponer()
    return NextResponse.json({ error: `No se pudo actualizar ${cfg.nombre}` }, { status: 500 })
  }

  const inserciones = await Promise.all([
    imputaciones.length
      ? supabase.from("imputaciones").insert(imputaciones.map((f) => ({ ...f, pago_id: id })))
      : { error: null },
    retenciones.length
      ? supabase.from("pago_retenciones").insert(retenciones.map((f) => ({ ...f, pago_id: id })))
      : { error: null },
    movimientos.length
      ? supabase
          .from("movimientos")
          .insert(movimientos.map((f) => ({ ...f, pago_id: id, created_by: user?.id ?? null })))
      : { error: null },
  ])

  const errInsercion = inserciones.find((r) => r.error)?.error
  if (errInsercion) {
    console.error(`[${tipo} PATCH insercion]`, errInsercion)
    await reponer()
    return NextResponse.json(
      { error: `No se pudo actualizar ${cfg.nombre}: ${errInsercion.message}` },
      { status: 500 }
    )
  }

  const { data: completo } = await supabase
    .from("pagos")
    .select(SELECT_COBRO)
    .eq("id", id)
    .single()

  return NextResponse.json({ [tipo]: completo ? aCobro(completo) : null })
}
