import { NextResponse } from "next/server"

import { supabase } from "@/lib/supabase"
import type { DocumentoSinAsiento } from "@/lib/admin/asientos"
import { TABLA_DE_TIPO, recordarCuentaEnFicha } from "@/lib/admin/entidad-de-comprobante"
import { respuestaPeriodoCerrado } from "@/lib/admin/cierre-server"
import { traerTodo } from "@/lib/admin/paginar"

/**
 * La lista de trabajo de lo que no llegó al mayor, y cómo arreglarlo.
 *
 * POR QUE ES UNA LISTA Y NO UN ERROR
 *
 * El motor de asientos no bloquea la carga: si no puede armar el asiento, deja
 * pasar el documento y anota el problema. Es la decisión correcta —frenar una
 * factura de $8M porque falta elegir una cuenta es peor que registrarla— pero
 * tiene una condición que hasta ahora no se cumplía del todo: **si no se
 * bloquea, tiene que verse, y tiene que poder arreglarse desde donde se ve.**
 *
 * Listar sin poder corregir es la mitad del trabajo. Obliga a anotar el número
 * de factura, ir a otro módulo, buscarla, abrirla, editarla entera y volver — y
 * lo que pasa en la práctica es que la lista crece hasta que alguien la ignora.
 */

const LIMITE = 500

export type FiltroPendientes = {
  /** `comprobante` para las pantallas de facturas, `movimiento` para bancos,
   *  `pago` para cobros y pagos. */
  origen?: "comprobante" | "movimiento" | "pago"
  /** Acota a un circuito. Con `origen = comprobante` separa compras de ventas;
   *  con `origen = pago`, cobros de pagos. */
  tipo?: "compra" | "venta"
}

/* ── Listado ──────────────────────────────────────────────────────────────── */

type FilaVista = {
  origen: string
  id: string
  fecha: string
  referencia: string
  importe_ars: number | null
  motivo: string
}

export async function listarPendientesContables(filtro: FiltroPendientes = {}) {
  const armar = () => {
    let consulta = supabase
      .from("documentos_sin_asiento")
      .select("origen, id, fecha, referencia, importe_ars, motivo")
    if (filtro.origen) consulta = consulta.eq("origen", filtro.origen)
    return consulta
  }

  let filas: FilaVista[]

  if (!filtro.tipo) {
    const { data, error } = await armar().order("fecha", { ascending: false }).limit(LIMITE)
    if (error) {
      console.error("[pendientes contables]", error)
      return NextResponse.json({ error: "No se pudieron cargar los pendientes" }, { status: 500 })
    }
    filas = (data ?? []) as FilaVista[]
  } else {
    /*
     * Con circuito, el tope va DESPUÉS de filtrar y no antes.
     *
     * La vista no expone si el documento es de compra o de venta, así que el
     * filtro se aplica afuera. Antes se cortaba en 500 y recién ahí se
     * filtraba: con muchos pendientes de un circuito, los del otro quedaban
     * fuera de los primeros 500 y la pantalla decía que no había ninguno. Ahora
     * se lee todo en páginas, se filtra y se corta.
     */
    const { filas: todas, error } = await traerTodo(() =>
      armar()
        .order("fecha", { ascending: false })
        .order("origen", { ascending: true })
        .order("id", { ascending: true })
    )
    let delCircuito: Set<string>
    try {
      if (error) throw error
      delCircuito = await idsDelCircuito(todas as FilaVista[], filtro.tipo)
    } catch (e) {
      console.error("[pendientes contables]", e)
      return NextResponse.json({ error: "No se pudieron cargar los pendientes" }, { status: 500 })
    }
    filas = (todas as FilaVista[]).filter((f) => delCircuito.has(f.id)).slice(0, LIMITE)
  }

  // El detalle se busca en una consulta por tipo de origen, no una por fila: son
  // dos consultas para cualquier cantidad de pendientes.
  const idsComprobante = filas.filter((f) => f.origen === "comprobante").map((f) => f.id)
  const idsMovimiento = filas.filter((f) => f.origen === "movimiento").map((f) => f.id)
  const idsPago = filas.filter((f) => f.origen === "pago").map((f) => f.id)

  const [detalleComprobantes, detalleMovimientos, detallePagos] = await Promise.all([
    detalleDeComprobantes(idsComprobante),
    detalleDeMovimientos(idsMovimiento),
    detalleDePagos(idsPago),
  ])

  let documentos: DocumentoSinAsiento[] = filas.map((f) => {
    const origen: DocumentoSinAsiento["origen"] =
      f.origen === "movimiento" ? "movimiento" : f.origen === "pago" ? "pago" : "comprobante"

    const extra =
      origen === "comprobante"
        ? detalleComprobantes.get(f.id)
        : origen === "pago"
          ? detallePagos.get(f.id)
          : detalleMovimientos.get(f.id)

    return {
      origen,
      id: f.id,
      fecha: f.fecha,
      referencia: f.referencia,
      importeArs: Number(f.importe_ars ?? 0),
      motivo: f.motivo,
      tipo: extra?.tipo ?? null,
      contraparte: extra?.contraparte ?? null,
      detalle: extra?.detalle ?? null,
      cuentaContableId: extra?.cuentaContableId ?? null,
      corregibleConCuenta: origen !== "pago",
    }
  })

  // El filtro por circuito ya se aplicó arriba, antes del tope. Se repite acá
  // contra el detalle por si un documento cambió de circuito entre las dos
  // lecturas: lo que se muestra tiene que coincidir con lo que dice la fila.
  if (filtro.tipo) {
    documentos = documentos.filter((d) => d.tipo === filtro.tipo)
  }

  return NextResponse.json({ documentos, cantidad: documentos.length })
}

/* ── Sólo la cantidad ─────────────────────────────────────────────────────── */

/**
 * Cuántos pendientes hay, sin armar la lista.
 *
 * Los carteles de aviso de cada pantalla sólo muestran el número, y para eso
 * pedían la lista entera con el detalle de cada documento —tres consultas más
 * por cartel—. Sin circuito alcanza con un `count` sobre la vista; con
 * circuito hay que mirar el tipo de cada documento (la vista no lo tiene), pero
 * sólo el id y sin el detalle.
 */
export async function contarPendientesContables(filtro: FiltroPendientes = {}) {
  if (!filtro.tipo) {
    let consulta = supabase
      .from("documentos_sin_asiento")
      .select("id", { count: "exact", head: true })
    if (filtro.origen) consulta = consulta.eq("origen", filtro.origen)
    const { count, error } = await consulta
    if (error) {
      console.error("[pendientes contables cantidad]", error)
      return NextResponse.json({ error: "No se pudieron cargar los pendientes" }, { status: 500 })
    }
    return NextResponse.json({ cantidad: count ?? 0 })
  }

  const tipo = filtro.tipo
  const { filas, error } = await traerTodo(() => {
    let consulta = supabase
      .from("documentos_sin_asiento")
      .select("origen, id")
      // Un movimiento no tiene circuito: con `tipo` nunca cuenta.
      .neq("origen", "movimiento")
    if (filtro.origen) consulta = consulta.eq("origen", filtro.origen)
    return consulta.order("origen", { ascending: true }).order("id", { ascending: true })
  })
  try {
    if (error) throw error
    const delCircuito = await idsDelCircuito(filas as { origen: string; id: string }[], tipo)
    return NextResponse.json({ cantidad: delCircuito.size })
  } catch (e) {
    console.error("[pendientes contables cantidad]", e)
    return NextResponse.json({ error: "No se pudieron cargar los pendientes" }, { status: 500 })
  }
}

/**
 * De esos documentos, los que son del circuito pedido. Con la misma regla que
 * el detalle: un comprobante de compra es compra y cualquier otro venta; un
 * recibo de tipo `pago` es compra y cualquier otro venta. Un movimiento no es
 * de ninguno. Los lotes van a la vez.
 */
async function idsDelCircuito(
  filas: { origen: string; id: string }[],
  tipo: "compra" | "venta"
): Promise<Set<string>> {
  const lotes = (ids: string[]) => {
    const out: string[][] = []
    for (let i = 0; i < ids.length; i += 200) out.push(ids.slice(i, i + 200))
    return out
  }
  const leer = (tabla: "comprobantes" | "pagos", lote: string[]) => {
    const valor = tabla === "comprobantes" ? "compra" : "pago"
    const q = supabase.from(tabla).select("id").in("id", lote)
    return (tipo === "compra" ? q.eq("tipo", valor) : q.neq("tipo", valor)).then(({ data, error }) => {
      if (error) throw error
      return (data ?? []).map((r) => r.id as string)
    })
  }
  const comprobantes = filas.filter((f) => f.origen === "comprobante").map((f) => f.id)
  const pagos = filas.filter((f) => f.origen === "pago").map((f) => f.id)
  const resultados = await Promise.all([
    ...lotes(comprobantes).map((l) => leer("comprobantes", l)),
    ...lotes(pagos).map((l) => leer("pagos", l)),
  ])
  return new Set(resultados.flat())
}

type Extra = {
  tipo: "compra" | "venta" | null
  contraparte: string | null
  detalle: string | null
  cuentaContableId: string | null
}

async function detalleDeComprobantes(ids: string[]): Promise<Map<string, Extra>> {
  if (ids.length === 0) return new Map()

  const { data } = await supabase
    .from("comprobantes")
    .select(
      "id, tipo, detalle, cuenta_contable_id, cliente:clientes (razon_social), proveedor:proveedores (razon_social)"
    )
    .in("id", ids)

  type Fila = {
    id: string
    tipo: string
    detalle: string | null
    cuenta_contable_id: string | null
    cliente: { razon_social: string } | null
    proveedor: { razon_social: string } | null
  }

  return new Map(
    ((data ?? []) as unknown as Fila[]).map((c) => [
      c.id,
      {
        tipo: c.tipo === "compra" ? "compra" : "venta",
        contraparte: c.proveedor?.razon_social ?? c.cliente?.razon_social ?? null,
        detalle: c.detalle,
        cuentaContableId: c.cuenta_contable_id,
      } satisfies Extra,
    ])
  )
}

async function detalleDeMovimientos(ids: string[]): Promise<Map<string, Extra>> {
  if (ids.length === 0) return new Map()

  const { data } = await supabase
    .from("movimientos")
    .select("id, detalle, referencia, cuenta_contable_id, cuenta:cuentas_financieras (nombre)")
    .in("id", ids)

  type Fila = {
    id: string
    detalle: string | null
    referencia: string | null
    cuenta_contable_id: string | null
    cuenta: { nombre: string } | null
  }

  return new Map(
    ((data ?? []) as unknown as Fila[]).map((m) => [
      m.id,
      {
        tipo: null,
        contraparte: m.cuenta?.nombre ?? null,
        detalle: m.detalle ?? m.referencia,
        cuentaContableId: m.cuenta_contable_id,
      } satisfies Extra,
    ])
  )
}

/**
 * De quién es el recibo y qué cancela.
 *
 * `tipo` reusa `compra`/`venta` para que el filtro por circuito de las pantallas
 * funcione igual que con los comprobantes: un pago a proveedor pertenece al
 * circuito de compras y un cobro al de ventas, aunque el documento sea un recibo.
 */
async function detalleDePagos(ids: string[]): Promise<Map<string, Extra>> {
  if (ids.length === 0) return new Map()

  const { data } = await supabase
    .from("pagos")
    .select(
      "id, tipo, observaciones, cliente:clientes (razon_social), proveedor:proveedores (razon_social)"
    )
    .in("id", ids)

  type Fila = {
    id: string
    tipo: string
    observaciones: string | null
    cliente: { razon_social: string } | null
    proveedor: { razon_social: string } | null
  }

  return new Map(
    ((data ?? []) as unknown as Fila[]).map((p) => [
      p.id,
      {
        tipo: p.tipo === "pago" ? "compra" : "venta",
        contraparte: p.proveedor?.razon_social ?? p.cliente?.razon_social ?? null,
        detalle: p.observaciones,
        // Un recibo no tiene cuenta contable propia. Se deja en null y
        // `corregibleConCuenta` es lo que la pantalla mira.
        cuentaContableId: null,
      } satisfies Extra,
    ])
  )
}

/* ── Corrección ───────────────────────────────────────────────────────────── */

/**
 * Imputar un documento a una cuenta.
 *
 * Es un endpoint de un solo campo, y esa es toda su gracia. Editar la factura
 * entera para cambiarle la cuenta obliga a mandar de vuelta los importes —y por
 * lo tanto a revalidarlos, y a chocar contra la regla que impide editar un
 * comprobante ya imputado en un recibo—. Nada de eso tiene que ver con elegir
 * contra qué cuenta va: es una decisión contable sobre un documento que ya está
 * bien cargado.
 *
 * El asiento no se genera acá. Lo dispara el trigger de la tabla al ver el
 * UPDATE, igual que en cualquier otro camino, así que no hay dos maneras de
 * escribir un asiento que puedan divergir.
 */
export async function imputarDocumento(req: Request) {
  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }

  const origen = body.origen
  const id = typeof body.id === "string" ? body.id : ""
  const cuentaContableId = typeof body.cuentaContableId === "string" ? body.cuentaContableId : ""

  if (origen !== "comprobante" && origen !== "movimiento") {
    return NextResponse.json({ error: "Origen inválido" }, { status: 400 })
  }
  if (!id) return NextResponse.json({ error: "Falta el documento" }, { status: 400 })
  if (!cuentaContableId) {
    return NextResponse.json({ error: "Elegí la cuenta contable" }, { status: 400 })
  }

  const tabla = origen === "comprobante" ? "comprobantes" : "movimientos"

  const { data, error } = await supabase
    .from(tabla)
    .update({ cuenta_contable_id: cuentaContableId })
    .eq("id", id)
    .select(origen === "comprobante" ? "id, tipo, cliente_id, proveedor_id" : "id")
    .maybeSingle()

  if (error) {
    if (error.code === "23503") {
      return NextResponse.json({ error: "Esa cuenta contable ya no existe" }, { status: 409 })
    }
    const cerrado = respuestaPeriodoCerrado(error)
    if (cerrado) return cerrado
    console.error("[imputar]", error)
    return NextResponse.json({ error: "No se pudo imputar el documento" }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 })

  // Corregida la factura, la ficha aprende: es la misma regla que en el alta, y
  // es lo que hace que este pendiente no vuelva a aparecer para ese proveedor.
  if (origen === "comprobante") {
    const c = data as unknown as {
      tipo: string
      cliente_id: string | null
      proveedor_id: string | null
    }
    const esCompra = c.tipo === "compra"
    const entidadId = esCompra ? c.proveedor_id : c.cliente_id
    if (entidadId) {
      await recordarCuentaEnFicha(
        TABLA_DE_TIPO[esCompra ? "compra" : "venta"],
        entidadId,
        cuentaContableId
      )
    }
  }

  /* Se relee la vista para contestar si el problema quedó resuelto. El trigger
     puede haber fallado por otra cosa —una cuenta de sistema sin configurar— y
     en ese caso el documento sigue sin asiento aunque la cuenta ya esté. Decir
     "listo" sin mirar sería volver al problema que este módulo resuelve. */
  const { data: sigue } = await supabase
    .from("documentos_sin_asiento")
    .select("motivo")
    .eq("id", id)
    .maybeSingle()

  return NextResponse.json({
    ok: !sigue,
    motivo: sigue?.motivo ?? null,
  })
}
