import { NextResponse } from "next/server"

import { supabase } from "@/lib/supabase"
import { formatearNumero, type TipoComprobante } from "@/lib/admin/comprobantes"
import {
  SELECT_COMPROBANTE,
  aComprobante,
  conSaldos,
} from "@/lib/admin/comprobantes-server"
import { aCliente, aProveedor } from "@/lib/admin/entidades-server"
import type { TipoEntidad } from "@/lib/admin/entidades"
import { redondear, type Moneda } from "@/lib/admin/moneda"
import {
  RESUMEN_VACIO,
  type ComprobanteBreve,
  type ImputacionDetalle,
  type PagoBreve,
  type ResumenEntidad,
} from "@/lib/admin/detalle"

/**
 * Lo que hace falta para abrir una fila y para que la tabla muestre plata.
 *
 * Todo lo de acá sale de la vista `comprobantes_saldo`, que es la única fuente
 * que sabe cuánto queda impago: el saldo no es una columna de `comprobantes`
 * —se calcula como `total − Σ imputado`—, así que preguntarle a la tabla cuánto
 * debe un cliente devuelve lo que facturó, que es otra cosa.
 */

/** El espejo de cada circuito: quién es la contraparte y cómo se llama su
 *  comprobante y su recibo. Está una vez porque las seis combinaciones son la
 *  misma consulta con otros nombres. */
const CIRCUITO = {
  cliente: {
    tabla: "clientes" as const,
    campo: "cliente_id" as const,
    select: "*, vendedor:vendedores (id, nombre)",
    mapear: aCliente,
    tipoComprobante: "venta" as TipoComprobante,
    tipoPago: "cobro" as const,
  },
  proveedor: {
    tabla: "proveedores" as const,
    campo: "proveedor_id" as const,
    select: "*",
    mapear: aProveedor,
    tipoComprobante: "compra" as TipoComprobante,
    tipoPago: "pago" as const,
  },
}

/** Techo de filas del agregado. Con más comprobantes pendientes que esto en una
 *  sola página de fichas, el número se queda corto — pasa antes por acá que por
 *  la memoria del navegador, y es un escenario que hoy no existe. */
const TOPE_PENDIENTES = 3000

const hoyISO = () => new Date().toISOString().slice(0, 10)

/* ── Cuánto debe cada ficha ───────────────────────────────────────────────── */

/**
 * El pendiente de varias fichas de una, para la columna de la tabla.
 *
 * Una consulta para toda la página y no una por fila: veinticinco consultas en
 * paralelo contra la misma vista es la forma más rápida de convertir un listado
 * de 200 ms en uno de dos segundos.
 */
export async function resumenPorEntidad(
  tipo: TipoEntidad,
  ids: string[]
): Promise<Map<string, ResumenEntidad>> {
  const mapa = new Map<string, ResumenEntidad>()
  if (ids.length === 0) return mapa

  const cfg = CIRCUITO[tipo]

  const { data, error } = await supabase
    .from("comprobantes_saldo")
    .select(`${cfg.campo}, moneda, saldo, signo, fecha_vencimiento`)
    .eq("tipo", cfg.tipoComprobante)
    .in(cfg.campo, ids)
    .gt("saldo", 0)
    .limit(TOPE_PENDIENTES)

  if (error) {
    // Sin el agregado la tabla se dibuja igual, con la columna en blanco. Es
    // preferible a que un listado de clientes falle entero porque no se pudo
    // calcular una deuda.
    console.error(`[resumen ${tipo}]`, error)
    return mapa
  }

  const hoy = hoyISO()

  for (const cruda of data ?? []) {
    // El campo de la contraparte cambia según el circuito, y PostgREST tipa el
    // select como una unión de las dos formas posibles. Un `Record` acá evita
    // repetir la función entera para cambiar un nombre de columna.
    const fila = cruda as unknown as Record<string, unknown>
    const id = fila[cfg.campo] as string | null
    if (!id) continue

    const r = mapa.get(id) ?? { ...RESUMEN_VACIO }
    const saldo = Number(fila.saldo)
    const signo = Number(fila.signo) === -1 ? -1 : 1
    const esPesos = fila.moneda === "ARS"
    const venc = fila.fecha_vencimiento as string | null

    // Con signo: una nota de crédito pendiente baja la deuda en vez de subirla.
    if (esPesos) r.pendienteArs += saldo * signo
    else r.pendienteUsd += saldo * signo

    // Lo que sigue solo aplica a lo que hay que ir a cobrar. Una nota de crédito
    // no vence ni se reclama.
    if (signo === 1) {
      r.cantidad++
      if (venc) {
        if (venc < hoy) {
          r.vencidas++
          if (esPesos) r.vencidoArs += saldo
          else r.vencidoUsd += saldo
        }
        if (!r.proximoVencimiento || venc < r.proximoVencimiento) {
          r.proximoVencimiento = venc
        }
      }
    }

    mapa.set(id, r)
  }

  for (const r of mapa.values()) {
    r.pendienteArs = redondear(r.pendienteArs)
    r.pendienteUsd = redondear(r.pendienteUsd)
    r.vencidoArs = redondear(r.vencidoArs)
    r.vencidoUsd = redondear(r.vencidoUsd)
  }

  return mapa
}

/* ── Detalle de una ficha ─────────────────────────────────────────────────── */

export async function detalleEntidad(tipo: TipoEntidad, id: string) {
  const cfg = CIRCUITO[tipo]

  const { data: ficha, error } = await supabase
    .from(cfg.tabla)
    .select(cfg.select)
    .eq("id", id)
    .maybeSingle()

  if (error) {
    console.error(`[detalle ${tipo}]`, error)
    return NextResponse.json({ error: "No se pudo cargar la ficha" }, { status: 500 })
  }
  if (!ficha) return NextResponse.json({ error: "No encontrado" }, { status: 404 })

  const [resumenes, comprobantes, pagos] = await Promise.all([
    resumenPorEntidad(tipo, [id]),
    ultimosComprobantes(cfg.tipoComprobante, cfg.campo, id),
    ultimosPagos(cfg.tipoPago, cfg.campo, id),
  ])

  return NextResponse.json({
    entidad: cfg.mapear(ficha as unknown as Record<string, unknown>),
    resumen: resumenes.get(id) ?? RESUMEN_VACIO,
    comprobantes,
    pagos,
  })
}

/** Los últimos movimientos de la ficha. Ocho y no todos: el panel contesta "qué
 *  viene pasando con este cliente", y para el historial completo está el estado
 *  de cuenta, que además corre el saldo. */
async function ultimosComprobantes(
  tipo: TipoComprobante,
  campo: string,
  id: string
): Promise<ComprobanteBreve[]> {
  const { data, error } = await supabase
    .from("comprobantes_saldo")
    .select("id, clase, punto_venta, numero, fecha, fecha_vencimiento, moneda, total, saldo, signo")
    .eq("tipo", tipo)
    .eq(campo, id)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(8)

  if (error) {
    console.error("[detalle comprobantes]", error)
    return []
  }

  return (data ?? []).map((c) => ({
    id: c.id as string,
    clase: c.clase as string,
    numero: formatearNumero(c.punto_venta as number | null, c.numero as number | null),
    fecha: c.fecha as string,
    fechaVencimiento: (c.fecha_vencimiento as string | null) ?? null,
    moneda: c.moneda as Moneda,
    total: Number(c.total),
    saldo: Number(c.saldo),
    signo: Number(c.signo) === -1 ? -1 : 1,
  }))
}

async function ultimosPagos(
  tipo: "cobro" | "pago",
  campo: string,
  id: string
): Promise<PagoBreve[]> {
  const { data, error } = await supabase
    .from("pagos")
    .select(
      "id, fecha, moneda, ret_ganancias, ret_iva, ret_iibb, ret_suss, movimientos (importe), imputaciones (id)"
    )
    .eq("tipo", tipo)
    .eq(campo, id)
    .order("fecha", { ascending: false })
    .limit(6)

  if (error) {
    console.error("[detalle pagos]", error)
    return []
  }

  return (data ?? []).map((p) => {
    const medios = (p.movimientos ?? []) as { importe: number | string }[]
    const retenciones =
      Number(p.ret_ganancias ?? 0) +
      Number(p.ret_iva ?? 0) +
      Number(p.ret_iibb ?? 0) +
      Number(p.ret_suss ?? 0)

    return {
      id: p.id as string,
      fecha: p.fecha as string,
      moneda: p.moneda as Moneda,
      // Medios + retenciones: lo que el recibo canceló, que es más que lo que
      // entró a la caja cuando hubo retención.
      total: redondear(medios.reduce((a, m) => a + Number(m.importe), 0) + retenciones),
      comprobantes: ((p.imputaciones ?? []) as unknown[]).length,
    }
  })
}

/* ── Detalle de un comprobante ────────────────────────────────────────────── */

export async function detalleComprobante(tipo: TipoComprobante, id: string) {
  const { data, error } = await supabase
    .from("comprobantes")
    .select(SELECT_COMPROBANTE)
    .eq("id", id)
    .eq("tipo", tipo)
    .maybeSingle()

  if (error) {
    console.error(`[detalle comprobante ${tipo}]`, error)
    return NextResponse.json({ error: "No se pudo cargar el comprobante" }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: "No encontrado" }, { status: 404 })

  const [comprobante] = await conSaldos([
    aComprobante(data as unknown as Record<string, unknown>),
  ])

  return NextResponse.json({ comprobante, imputaciones: await imputacionesDe(id) })
}

/** Quién canceló este comprobante y por dónde entró la plata. Es lo que la fila
 *  de la tabla no puede decir: ahí solo se ve cuánto falta, no de dónde vino lo
 *  que ya se cobró. */
async function imputacionesDe(comprobanteId: string): Promise<ImputacionDetalle[]> {
  const { data, error } = await supabase
    .from("imputaciones")
    .select(
      `id, importe,
       pago:pagos (
         id, fecha, moneda,
         movimientos (referencia, cuenta:cuentas_financieras (nombre))
       )`
    )
    .eq("comprobante_id", comprobanteId)

  if (error) {
    console.error("[detalle imputaciones]", error)
    return []
  }

  type FilaPago = {
    id: string
    fecha: string
    moneda: string
    movimientos?: { referencia: string | null; cuenta?: { nombre: string } | null }[]
  }

  const filas = (data ?? []).map((i) => {
    const pago = i.pago as unknown as FilaPago | null
    const medios = pago?.movimientos ?? []

    return {
      id: i.id as string,
      pagoId: pago?.id ?? "",
      fecha: pago?.fecha ?? "",
      importe: Number(i.importe),
      moneda: (pago?.moneda ?? "ARS") as Moneda,
      // Sin repetidos: un recibo pagado en dos tramos desde la misma cuenta
      // nombraría dos veces al mismo banco y parecería que hubo dos pagos.
      cuentas: [...new Set(medios.map((m) => m.cuenta?.nombre).filter(Boolean))] as string[],
      referencias: [...new Set(medios.map((m) => m.referencia).filter(Boolean))] as string[],
    }
  })

  // El más reciente arriba, igual que en todas las listas del módulo.
  return filas.sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
}
