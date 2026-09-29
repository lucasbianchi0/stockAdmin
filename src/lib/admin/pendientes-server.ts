import { NextResponse } from "next/server"

import { supabase } from "@/lib/supabase"
import { redondear } from "@/lib/admin/moneda"
import type { OrdenACuenta, Pendiente } from "@/lib/admin/cobros"
import type { TipoPago } from "@/lib/admin/cobros-server"

/**
 * Las facturas de un cliente que todavía deben algo.
 *
 * Consulta la vista `comprobantes_saldo`, que hace `total − Σ imputado`. Va
 * contra la vista y no contra la tabla porque el filtro que importa —"saldo
 * mayor a cero"— no existe como columna en la tabla: si se calculara del lado
 * del cliente habría que bajar todas las facturas del cliente para descartar
 * las pagadas.
 *
 * Orden por vencimiento ascendente: lo que vence primero es lo que hay que
 * cobrar primero, y así el panel de imputación ya viene priorizado.
 */
export async function listarPendientes(tipo: TipoPago, req: Request) {
  const esCobro = tipo === "cobro"
  const campo = esCobro ? "cliente_id" : "proveedor_id"
  const tipoComprobante = esCobro ? "venta" : "compra"

  const entidadId = new URL(req.url).searchParams.get("entidadId") ?? ""
  if (!entidadId) {
    return NextResponse.json(
      { error: esCobro ? "Falta el cliente" : "Falta el proveedor" },
      { status: 400 }
    )
  }

  /**
   * Al editar un recibo hay que sumar las facturas que ese mismo recibo canceló.
   *
   * Una factura que el recibo saldó por completo tiene saldo cero y por lo tanto
   * no es "pendiente": no aparecería en la lista, y el formulario de edición se
   * abriría sin las facturas que el recibo estaba cancelando. Con `incluirPago`
   * se traen igual, y su saldo viene aumentado en lo que este recibo les imputó
   * —que es el saldo que tendrían si el recibo no existiera, o sea contra el que
   * hay que validar la versión nueva.
   */
  const incluirPago = new URL(req.url).searchParams.get("incluirPago") ?? ""

  const yaImputado = new Map<string, number>()
  if (incluirPago) {
    const { data: previas } = await supabase
      .from("imputaciones")
      .select("comprobante_id, importe")
      .eq("pago_id", incluirPago)

    for (const i of previas ?? []) {
      const cid = i.comprobante_id as string
      yaImputado.set(cid, (yaImputado.get(cid) ?? 0) + Number(i.importe))
    }
  }

  const SELECT =
    "id, clase, punto_venta, numero, fecha, fecha_vencimiento, moneda, tc, total, imputado, saldo, detalle, signo"

  const consulta = supabase
    .from("comprobantes_vigentes")
    .select(SELECT)
    .eq("tipo", tipoComprobante)
    .eq(campo, entidadId)

  /*
   * Las órdenes de pago a cuenta con saldo, una por una.
   *
   * Van con los pendientes porque se piden en el mismo momento y por la misma
   * razón —se eligió una ficha— y porque la pantalla las muestra al lado de las
   * facturas: es lo que pidió Administración, poder imputar cada factura contra
   * SU pago y no contra una bolsa común. Por moneda, igual que las facturas: un
   * anticipo en dólares no cancela una factura en pesos sin decidir a qué
   * cambio.
   */
  const saldoPromesa = supabase
    .from("ordenes_a_cuenta")
    .select("pago_id, fecha, moneda, importe, aplicado, saldo")
    .eq("entidad_tipo", esCobro ? "cliente" : "proveedor")
    .eq("entidad_id", entidadId)
    .order("fecha", { ascending: true })

  const [{ data: conSaldo, error }, { data: delRecibo }, { data: saldos }] = await Promise.all([
    consulta
      .gt("saldo", 0)
      .order("fecha_vencimiento", { ascending: true, nullsFirst: false })
      .order("fecha", { ascending: true })
      .limit(200),
    yaImputado.size > 0
      ? supabase
          .from("comprobantes_vigentes")
          .select(SELECT)
          .in("id", [...yaImputado.keys()])
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    saldoPromesa,
  ])

  if (error) {
    console.error(`[${tipo} pendientes]`, error)
    return NextResponse.json(
      { error: "No se pudieron cargar los comprobantes pendientes" },
      { status: 500 }
    )
  }

  // Unidos sin repetir: una factura parcialmente cancelada por este recibo
  // aparece en las dos consultas.
  const porId = new Map<string, Record<string, unknown>>()
  for (const f of (conSaldo ?? []) as unknown as Record<string, unknown>[]) {
    porId.set(f.id as string, f)
  }
  for (const f of (delRecibo ?? []) as unknown as Record<string, unknown>[]) {
    porId.set(f.id as string, f)
  }

  const data = [...porId.values()].sort((a, b) => {
    const va = (a.fecha_vencimiento as string) ?? (a.fecha as string)
    const vb = (b.fecha_vencimiento as string) ?? (b.fecha as string)
    return va < vb ? -1 : va > vb ? 1 : 0
  })

  const pendientes: Pendiente[] = data.map((f) => ({
    id: f.id as string,
    clase: f.clase as string,
    puntoVenta: (f.punto_venta as number | null) ?? null,
    numero: (f.numero as number | null) ?? null,
    fecha: f.fecha as string,
    fechaVencimiento: (f.fecha_vencimiento as string | null) ?? null,
    moneda: f.moneda as Pendiente["moneda"],
    tc: f.tc === null ? null : Number(f.tc),
    total: Number(f.total),
    imputado: Number(f.imputado),
    // El saldo que tendría si este recibo no existiera: es contra el que se
    // valida la versión editada.
    saldo: Number(f.saldo) + (yaImputado.get(f.id as string) ?? 0),
    detalle: (f.detalle as string | null) ?? null,
    signo: Number(f.signo) === -1 ? -1 : 1,
  }))

  /*
   * Al editar, cada orden muestra el saldo que tendría si este recibo no
   * existiera —igual que las facturas—. Sin esto, abrir un recibo que consumió
   * una orden entera y guardarlo sin cambiar nada diría que esa orden ya no
   * tiene con qué.
   */
  const yaTomado = new Map<string, number>()
  if (incluirPago) {
    const { data: previas } = await supabase
      .from("pago_aplicaciones")
      .select("pago_origen_id, importe")
      .eq("pago_destino_id", incluirPago)
    for (const a of previas ?? []) {
      const oid = a.pago_origen_id as string
      yaTomado.set(oid, (yaTomado.get(oid) ?? 0) + Number(a.importe))
    }
  }

  const ordenes: OrdenACuenta[] = (saldos ?? []).map((o) => ({
    id: o.pago_id as string,
    fecha: o.fecha as string,
    moneda: (o.moneda === "USD" ? "USD" : "ARS") as Pendiente["moneda"],
    importe: Number(o.importe) || 0,
    saldo: redondear((Number(o.saldo) || 0) + (yaTomado.get(o.pago_id as string) ?? 0)),
  }))

  /* Las que este recibo agotó por completo no vuelven en la vista —su saldo es
     cero— pero tienen que estar en la lista para poder desaplicarlas. */
  for (const [id, tomado] of yaTomado) {
    if (ordenes.some((o) => o.id === id)) continue
    const { data: op } = await supabase
      .from("pagos")
      .select("id, fecha, moneda, a_cuenta")
      .eq("id", id)
      .maybeSingle()
    if (!op) continue
    ordenes.push({
      id: op.id as string,
      fecha: op.fecha as string,
      moneda: (op.moneda === "USD" ? "USD" : "ARS") as Pendiente["moneda"],
      importe: Number(op.a_cuenta) || 0,
      saldo: redondear(tomado),
    })
  }

  ordenes.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0))

  return NextResponse.json({ pendientes, ordenes })
}
