import { NextResponse } from "next/server"

import { supabase } from "@/lib/supabase"
import type { DocumentoSinAsiento } from "@/lib/admin/asientos"
import { TABLA_DE_TIPO, recordarCuentaEnFicha } from "@/lib/admin/entidad-de-comprobante"

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
  /** `comprobante` para las pantallas de facturas, `movimiento` para bancos. */
  origen?: "comprobante" | "movimiento"
  /** Acota a un circuito. Sólo tiene sentido con `origen = comprobante`. */
  tipo?: "compra" | "venta"
}

/* ── Listado ──────────────────────────────────────────────────────────────── */

export async function listarPendientesContables(filtro: FiltroPendientes = {}) {
  let consulta = supabase
    .from("documentos_sin_asiento")
    .select("origen, id, fecha, referencia, importe_ars, motivo")

  if (filtro.origen) consulta = consulta.eq("origen", filtro.origen)

  const { data, error } = await consulta
    .order("fecha", { ascending: false })
    .limit(LIMITE)

  if (error) {
    console.error("[pendientes contables]", error)
    return NextResponse.json({ error: "No se pudieron cargar los pendientes" }, { status: 500 })
  }

  const filas = (data ?? []) as {
    origen: string
    id: string
    fecha: string
    referencia: string
    importe_ars: number | null
    motivo: string
  }[]

  // El detalle se busca en una consulta por tipo de origen, no una por fila: son
  // dos consultas para cualquier cantidad de pendientes.
  const idsComprobante = filas.filter((f) => f.origen === "comprobante").map((f) => f.id)
  const idsMovimiento = filas.filter((f) => f.origen === "movimiento").map((f) => f.id)

  const [detalleComprobantes, detalleMovimientos] = await Promise.all([
    detalleDeComprobantes(idsComprobante),
    detalleDeMovimientos(idsMovimiento),
  ])

  let documentos: DocumentoSinAsiento[] = filas.map((f) => {
    const extra =
      f.origen === "comprobante" ? detalleComprobantes.get(f.id) : detalleMovimientos.get(f.id)

    return {
      origen: f.origen === "movimiento" ? "movimiento" : "comprobante",
      id: f.id,
      fecha: f.fecha,
      referencia: f.referencia,
      importeArs: Number(f.importe_ars ?? 0),
      motivo: f.motivo,
      tipo: extra?.tipo ?? null,
      contraparte: extra?.contraparte ?? null,
      detalle: extra?.detalle ?? null,
      cuentaContableId: extra?.cuentaContableId ?? null,
    }
  })

  // El filtro por circuito se aplica acá y no en la consulta: la vista no expone
  // el tipo del comprobante, y traerlo hasta el detalle es más simple que
  // reescribir la vista para una pantalla.
  if (filtro.tipo) {
    documentos = documentos.filter((d) => d.tipo === filtro.tipo)
  }

  return NextResponse.json({ documentos, cantidad: documentos.length })
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
