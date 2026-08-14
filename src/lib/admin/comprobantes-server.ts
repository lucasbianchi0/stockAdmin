import { NextResponse } from "next/server"

import { supabase } from "@/lib/supabase"
import { esMoneda, redondear } from "@/lib/admin/moneda"
import {
  buscarClase,
  totalDe,
  type Comprobante,
  type TipoComprobante,
} from "@/lib/admin/comprobantes"
import { textoONull } from "@/lib/admin/entidades"

/**
 * Validación y mapeo de comprobantes, compartido por ventas y compras.
 *
 * El criterio general: la app **no confía en el total que manda el cliente**. Lo
 * recalcula desde los componentes. Si el navegador mandara un total distinto de
 * la suma de sus partes —por un bug de redondeo o porque alguien tocó el
 * request— el libro de IVA dejaría de cerrar con las facturas, y eso se descubre
 * dos meses después en la declaración jurada.
 */

export const SELECT_COMPROBANTE = `
  *,
  cliente:clientes (id, razon_social),
  proveedor:proveedores (id, razon_social),
  cuenta:plan_cuentas (id, codigo, nombre),
  vendedor:vendedores (id, nombre)
`

type Fila = Record<string, unknown>

export type ValidacionComprobante = { fila: Fila } | { error: string; status: number }

const ISO = /^\d{4}-\d{2}-\d{2}$/

function fechaONull(v: unknown): string | null {
  return typeof v === "string" && ISO.test(v) ? v : null
}

/** Un importe del formulario. Negativo no: las notas de crédito se cargan en
 *  positivo y el signo sale de la clase. */
function importe(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v)
  if (!Number.isFinite(n) || n < 0) return 0
  return redondear(n)
}

function entero(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null
  const n = Number(v)
  return Number.isInteger(n) && n >= 0 ? n : null
}

export function validarComprobante(
  raw: Record<string, unknown>,
  tipo: TipoComprobante
): ValidacionComprobante {
  const clase = typeof raw.clase === "string" ? raw.clase.toUpperCase() : ""
  if (!buscarClase(tipo, clase)) {
    return { error: "Elegí un tipo de comprobante válido", status: 400 }
  }

  const fecha = fechaONull(raw.fecha)
  if (!fecha) return { error: "La fecha es obligatoria", status: 400 }

  const entidadId = typeof raw.entidadId === "string" ? raw.entidadId : ""
  if (!entidadId) {
    return {
      error: tipo === "venta" ? "Elegí el cliente" : "Elegí el proveedor",
      status: 400,
    }
  }

  const moneda = esMoneda(raw.moneda) ? raw.moneda : "ARS"

  /**
   * El TC de valuación del comprobante: pesos por dólar el día que se emitió.
   *
   * Antes se forzaba a 1 cuando la moneda era pesos, y como `total_usd` sale de
   * `total / tc`, el importe en dólares terminaba siendo idéntico al importe en
   * pesos — el punto 2 del pedido, con el screenshot de la factura de $ 8.058.622
   * que mostraba "USD 8.058.622" abajo.
   *
   * Ahora es un solo dato con un solo significado, y `null` es una respuesta
   * válida: quiere decir "no se conoce", y entonces el importe en dólares
   * tampoco se conoce y la pantalla muestra un guion. Un guion es correcto; el
   * número de antes no lo era.
   */
  let tc: number | null = null
  const tcCrudo = Number(raw.tc)
  if (Number.isFinite(tcCrudo) && tcCrudo > 0) tc = redondear(tcCrudo, 4)

  // En dólares sí es obligatorio: sin él no hay forma de valuar la factura en
  // pesos, y el estado de cuenta corre el saldo en pesos históricos.
  if (moneda === "USD" && tc === null) {
    return { error: "Un comprobante en dólares necesita tipo de cambio", status: 400 }
  }

  const importes = {
    netoGravado: importe(raw.netoGravado),
    alicuotaIva: Number(raw.alicuotaIva) || 0,
    iva: importe(raw.iva),
    noGravado: importe(raw.noGravado),
    exento: importe(raw.exento),
    percepcionIva: importe(raw.percepcionIva),
    percepcionIibb: importe(raw.percepcionIibb),
    otrosImpuestos: importe(raw.otrosImpuestos),
  }

  const total = totalDe(importes)
  if (total <= 0) {
    return { error: "El comprobante no puede tener total cero", status: 400 }
  }

  const fechaVencimiento = fechaONull(raw.fechaVencimiento)
  if (fechaVencimiento && fechaVencimiento < fecha) {
    return { error: "El vencimiento no puede ser anterior a la fecha", status: 400 }
  }

  const fila: Fila = {
    tipo,
    clase,
    fecha,
    fecha_vencimiento: fechaVencimiento,
    fecha_estimada_pago: fechaONull(raw.fechaEstimadaPago),
    punto_venta: entero(raw.puntoVenta),
    numero: entero(raw.numero),
    cuenta_contable_id: typeof raw.cuentaContableId === "string" && raw.cuentaContableId
      ? raw.cuentaContableId
      : null,
    detalle: textoONull(raw.detalle, 500),
    moneda,
    tc,
    neto_gravado: importes.netoGravado,
    alicuota_iva: importes.alicuotaIva || null,
    iva: importes.iva,
    no_gravado: importes.noGravado,
    exento: importes.exento,
    percepcion_iva: importes.percepcionIva,
    percepcion_iibb: importes.percepcionIibb,
    otros_impuestos: importes.otrosImpuestos,
    total,
    condicion_pago: textoONull(raw.condicionPago, 100),
    observaciones: textoONull(raw.observaciones, 1000),
  }

  if (tipo === "venta") {
    fila.cliente_id = entidadId
    fila.proveedor_id = null
    fila.vendedor_id =
      typeof raw.vendedorId === "string" && raw.vendedorId ? raw.vendedorId : null
  } else {
    fila.proveedor_id = entidadId
    fila.cliente_id = null
  }

  return { fila }
}

/** El 23505 acá es el comprobante repetido, que es el error más caro del rubro:
 *  duplica la deuda y el IVA. Merece un mensaje que diga exactamente eso. */
export function errorDeComprobante(
  error: { code?: string; message?: string },
  accion: string
) {
  if (error.code === "23505") {
    return NextResponse.json(
      { error: "Ese comprobante ya está cargado: mismo tipo, punto de venta y número" },
      { status: 409 }
    )
  }
  if (error.code === "23503") {
    return NextResponse.json(
      { error: "El cliente o la cuenta contable elegidos ya no existen" },
      { status: 409 }
    )
  }
  console.error(`[comprobantes ${accion}]`, error)
  return NextResponse.json({ error: `No se pudo ${accion} el comprobante` }, { status: 500 })
}

type FilaCompleta = Record<string, unknown> & {
  cliente?: { id: string; razon_social: string } | null
  proveedor?: { id: string; razon_social: string } | null
  cuenta?: { id: string; codigo: string; nombre: string } | null
  vendedor?: { id: string; nombre: string } | null
}

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v))

/** Para las columnas donde el nulo significa algo. `tc` nulo es "no se conoce la
 *  cotización", que no es lo mismo que cero — y convertirlo a cero haría que la
 *  UI dibujara un dato inventado, que es justo el bug que se está arreglando. */
const numONull = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v)

export function aComprobante(fila: FilaCompleta): Comprobante {
  return {
    id: fila.id as string,
    tipo: fila.tipo as TipoComprobante,
    clienteId: fila.cliente?.id ?? null,
    clienteNombre: fila.cliente?.razon_social ?? null,
    proveedorId: fila.proveedor?.id ?? null,
    proveedorNombre: fila.proveedor?.razon_social ?? null,
    clase: fila.clase as string,
    fecha: fila.fecha as string,
    fechaVencimiento: (fila.fecha_vencimiento as string | null) ?? null,
    fechaEstimadaPago: (fila.fecha_estimada_pago as string | null) ?? null,
    puntoVenta: (fila.punto_venta as number | null) ?? null,
    numero: (fila.numero as number | null) ?? null,
    cuentaContableId: fila.cuenta?.id ?? null,
    cuentaContableNombre: fila.cuenta ? `${fila.cuenta.codigo} · ${fila.cuenta.nombre}` : null,
    detalle: (fila.detalle as string | null) ?? null,
    moneda: fila.moneda as Comprobante["moneda"],
    tc: numONull(fila.tc),
    netoGravado: num(fila.neto_gravado),
    alicuotaIva: fila.alicuota_iva === null ? null : num(fila.alicuota_iva),
    iva: num(fila.iva),
    noGravado: num(fila.no_gravado),
    exento: num(fila.exento),
    percepcionIva: num(fila.percepcion_iva),
    percepcionIibb: num(fila.percepcion_iibb),
    otrosImpuestos: num(fila.otros_impuestos),
    total: num(fila.total),
    totalArs: num(fila.total_ars),
    totalUsd: numONull(fila.total_usd),
    signo: num(fila.signo) === -1 ? -1 : 1,
    condicionPago: (fila.condicion_pago as string | null) ?? null,
    vendedorId: fila.vendedor?.id ?? null,
    vendedorNombre: fila.vendedor?.nombre ?? null,
    observaciones: (fila.observaciones as string | null) ?? null,
    createdAt: fila.created_at as string,
    // Los completa `conSaldos` después de una consulta aparte; por defecto la
    // factura se considera entera pendiente.
    imputado: 0,
    saldo: num(fila.total),
  }
}

/**
 * Completa `imputado` y `saldo` de una página de comprobantes.
 *
 * Va en una segunda consulta en vez de leer la vista `comprobantes_saldo`
 * directamente porque el listado necesita traer el cliente, la cuenta contable y
 * el vendedor embebidos, y PostgREST resuelve esos embeds por las claves
 * foráneas de la tabla — que una vista no tiene. Dos consultas simples le ganan
 * a una consulta que depende de que el motor infiera relaciones.
 */
export async function conSaldos(comprobantes: Comprobante[]): Promise<Comprobante[]> {
  if (comprobantes.length === 0) return comprobantes

  const { data } = await supabase
    .from("imputaciones")
    .select("comprobante_id, importe")
    .in(
      "comprobante_id",
      comprobantes.map((c) => c.id)
    )

  const imputadoPorId = new Map<string, number>()
  for (const fila of (data ?? []) as { comprobante_id: string; importe: number }[]) {
    imputadoPorId.set(
      fila.comprobante_id,
      (imputadoPorId.get(fila.comprobante_id) ?? 0) + Number(fila.importe)
    )
  }

  return comprobantes.map((c) => {
    const imputado = redondear(imputadoPorId.get(c.id) ?? 0)
    return { ...c, imputado, saldo: redondear(c.total - imputado) }
  })
}
