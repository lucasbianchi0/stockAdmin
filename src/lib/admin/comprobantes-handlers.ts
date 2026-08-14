import { NextResponse } from "next/server"

import { supabase } from "@/lib/supabase"
import { createSupabaseServer } from "@/lib/supabase-server"
import { escaparParaOr, POR_PAGINA_MAX } from "@/lib/admin/entidades-server"
import type { TipoComprobante } from "@/lib/admin/comprobantes"
import {
  SELECT_COMPROBANTE,
  aComprobante,
  conSaldos,
  errorDeComprobante,
  validarComprobante,
} from "@/lib/admin/comprobantes-server"
import { cotizacionHasta } from "@/lib/admin/cotizaciones-server"

/**
 * Los handlers de facturas de venta y de compra, parametrizados por tipo.
 *
 * Las dos pantallas hacen exactamente lo mismo contra la misma tabla: cambian el
 * discriminador, contra qué maestro se filtra y cómo se llaman las cosas. Toda
 * la parte cara —validación de importes, unicidad, saldos, vencimientos— es una
 * sola implementación, que es el punto de haber unificado `comprobantes` en una
 * tabla desde el principio.
 */

const CAMPO_ENTIDAD: Record<TipoComprobante, string> = {
  venta: "cliente_id",
  compra: "proveedor_id",
}

const NOMBRE: Record<TipoComprobante, { singular: string; plural: string }> = {
  venta: { singular: "la factura", plural: "las facturas" },
  compra: { singular: "el comprobante", plural: "los comprobantes" },
}

/* ── Listado ──────────────────────────────────────────────────────────────── */

export async function listarComprobantes(tipo: TipoComprobante, req: Request) {
  const url = new URL(req.url)
  const pagina = Math.max(1, Number(url.searchParams.get("pagina")) || 1)
  const porPagina = Math.min(
    POR_PAGINA_MAX,
    Math.max(1, Number(url.searchParams.get("porPagina")) || 25)
  )
  const q = url.searchParams.get("q")?.trim() ?? ""
  const entidadId = url.searchParams.get("entidadId") ?? ""
  const moneda = url.searchParams.get("moneda") ?? ""
  const desdeFecha = url.searchParams.get("desde") ?? ""
  const hastaFecha = url.searchParams.get("hasta") ?? ""
  const vencimiento = url.searchParams.get("vencimiento") ?? ""

  let query = supabase
    .from("comprobantes")
    .select(SELECT_COMPROBANTE, { count: "exact" })
    .eq("tipo", tipo)

  if (entidadId) query = query.eq(CAMPO_ENTIDAD[tipo], entidadId)
  if (moneda === "ARS" || moneda === "USD") query = query.eq("moneda", moneda)
  if (desdeFecha) query = query.gte("fecha", desdeFecha)
  if (hastaFecha) query = query.lte("fecha", hastaFecha)

  // Contra la fecha del servidor y no la del navegador: si el reloj de una
  // máquina está corrido, el listado de vencidas no puede cambiar según quién
  // lo abra.
  if (vencimiento === "vencidas") {
    query = query.lt("fecha_vencimiento", hoyISO())
  } else if (vencimiento === "por_vencer") {
    query = query.gte("fecha_vencimiento", hoyISO()).lte("fecha_vencimiento", enDias(7))
  }

  if (q) {
    const texto = escaparParaOr(q)
    const soloDigitos = q.replace(/\D/g, "")
    const terminos = [`detalle.ilike.%${texto}%`, `observaciones.ilike.%${texto}%`]
    if (soloDigitos) terminos.push(`numero.eq.${Number(soloDigitos)}`)
    query = query.or(terminos.join(","))
  }

  const desde = (pagina - 1) * porPagina
  const { data, error, count } = await query
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false })
    .range(desde, desde + porPagina - 1)

  if (error) {
    console.error(`[${tipo} GET]`, error)
    return NextResponse.json(
      { error: `No se pudieron cargar ${NOMBRE[tipo].plural}` },
      { status: 500 }
    )
  }

  const comprobantes = await conSaldos((data ?? []).map(aComprobante))

  return NextResponse.json({ comprobantes, total: count ?? 0, pagina, porPagina })
}

/**
 * Completa el TC de valuación cuando el formulario no lo mandó.
 *
 * Un comprobante en pesos no necesita tipo de cambio para existir, pero sin él
 * no se puede ver en dólares — y verlo en las dos monedas es lo que pidió
 * administración. En vez de obligar a tipearlo factura por factura, se toma el
 * dólar archivado de esa fecha (o el último anterior, para los sábados y
 * feriados, que es lo que hace cualquier contador).
 *
 * Si no hay ninguno guardado queda en null, que significa "no se conoce" y la
 * pantalla muestra un guion. Nunca se inventa un 1.
 */
async function conTcDelDia(fila: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (fila.tc !== null && fila.tc !== undefined) return fila
  const tc = await cotizacionHasta(fila.fecha as string)
  return tc === null ? fila : { ...fila, tc }
}

/* ── Alta ─────────────────────────────────────────────────────────────────── */

export async function crearComprobante(tipo: TipoComprobante, req: Request) {
  const body = await leerBody(req)
  if ("error" in body) return body.error

  const validado = validarComprobante(body.raw, tipo)
  if ("error" in validado) {
    return NextResponse.json({ error: validado.error }, { status: validado.status })
  }

  const supabaseUsuario = await createSupabaseServer()
  const {
    data: { user },
  } = await supabaseUsuario.auth.getUser()

  const { data, error } = await supabase
    .from("comprobantes")
    .insert({ ...(await conTcDelDia(validado.fila)), created_by: user?.id ?? null })
    .select(SELECT_COMPROBANTE)
    .single()

  if (error) return errorDeComprobante(error, "crear")

  return NextResponse.json({ comprobante: aComprobante(data) }, { status: 201 })
}

/* ── Edición ──────────────────────────────────────────────────────────────── */

export async function editarComprobante(tipo: TipoComprobante, req: Request, id: string) {
  const body = await leerBody(req)
  if ("error" in body) return body.error

  const validado = validarComprobante(body.raw, tipo)
  if ("error" in validado) {
    return NextResponse.json({ error: validado.error }, { status: validado.status })
  }

  const { data, error } = await supabase
    .from("comprobantes")
    .update(await conTcDelDia(validado.fila))
    .eq("id", id)
    .eq("tipo", tipo)
    .select(SELECT_COMPROBANTE)
    .maybeSingle()

  if (error) return errorDeComprobante(error, "editar")
  if (!data) return NextResponse.json({ error: "Comprobante no encontrado" }, { status: 404 })

  return NextResponse.json({ comprobante: aComprobante(data) })
}

/* ── Borrado ──────────────────────────────────────────────────────────────── */

/**
 * Borrado definitivo, sin baja lógica.
 *
 * A diferencia de una ficha —que se da de baja porque su historia importa— un
 * comprobante mal cargado no tiene historia que preservar: es un error de
 * tipeo. Lo que sí la tiene es uno ya cobrado o pagado, y de eso se encarga la
 * FK de las imputaciones: el intento vuelve como 23503.
 */
export async function borrarComprobante(tipo: TipoComprobante, id: string) {
  const { data, error } = await supabase
    .from("comprobantes")
    .delete()
    .eq("id", id)
    .eq("tipo", tipo)
    .select("id")
    .maybeSingle()

  if (error) {
    if (error.code === "23503") {
      return NextResponse.json(
        {
          error:
            tipo === "venta"
              ? "No se puede eliminar: la factura tiene cobros imputados. Anulá el cobro primero."
              : "No se puede eliminar: el comprobante tiene pagos imputados. Anulá el pago primero.",
        },
        { status: 409 }
      )
    }
    console.error(`[${tipo} DELETE]`, error)
    return NextResponse.json(
      { error: `No se pudo eliminar ${NOMBRE[tipo].singular}` },
      { status: 500 }
    )
  }
  if (!data) return NextResponse.json({ error: "Comprobante no encontrado" }, { status: 404 })

  return NextResponse.json({ ok: true })
}

/* ── Utilidades ───────────────────────────────────────────────────────────── */

async function leerBody(
  req: Request
): Promise<{ raw: Record<string, unknown> } | { error: NextResponse }> {
  try {
    const body = await req.json()
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return { error: NextResponse.json({ error: "Body inválido" }, { status: 400 }) }
    }
    return { raw: body as Record<string, unknown> }
  } catch {
    return { error: NextResponse.json({ error: "Body inválido" }, { status: 400 }) }
  }
}

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function enDias(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}
