import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { ruta } from "@/lib/admin/ruta"
import { formatearNumero } from "@/lib/admin/comprobantes"
import { redondear } from "@/lib/admin/moneda"
import {
  ALICUOTAS_SUBDIARIO,
  type AlicuotaSubdiario,
  type FilaSubdiario,
  type LineaResumen,
  totalizar,
  type Subdiario,
} from "@/lib/admin/subdiarios"

/**
 * El subdiario de IVA del período: un renglón por comprobante confirmado.
 *
 * Sin tope y sin paginar en pantalla: un subdiario incompleto no sirve para
 * copiar al libro, y un mes de Accedra son decenas de comprobantes, no miles.
 * Se lee en páginas para no chocar con el límite de filas de PostgREST.
 *
 * El asiento resumen sale de los asientos que la base ya generó para esos mismos
 * comprobantes, agrupados por cuenta. Así el resumen dice exactamente lo que
 * está en el libro diario, y si un comprobante quedó sin asentar se avisa en
 * vez de inventarle las cuentas.
 */

const PAGINA = 1000

type Comprobante = {
  id: string
  fecha: string
  clase: string
  punto_venta: number | null
  numero: number | null
  cliente_id: string | null
  proveedor_id: string | null
  moneda: "ARS" | "USD"
  tc: number | string | null
  signo: number | null
  neto_gravado: number | string
  alicuota_iva: number | string | null
  iva: number | string
  no_gravado: number | string
  exento: number | string
  percepcion_iva: number | string
  percepcion_iibb_bsas: number | string
  percepcion_iibb_caba: number | string
  otros_impuestos: number | string
  total: number | string
}

const n = (v: unknown) => {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

/** Las claves de alícuota como las guarda la base (0.2100) → "0.21". */
const claveAlicuota = (v: unknown): string => String(Number(v))

const vacio = (): Record<AlicuotaSubdiario, number> => ({ "0.21": 0, "0.105": 0, "0.27": 0 })

async function enPaginas<T>(armar: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const todo: T[] = []
  for (let i = 0; ; i += PAGINA) {
    const { data, error } = await armar(i, i + PAGINA - 1)
    if (error) throw error
    todo.push(...(data ?? []))
    if (!data || data.length < PAGINA) return todo
  }
}

async function enLotes<T>(ids: string[], leer: (lote: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += 200) out.push(...(await leer(ids.slice(i, i + 200))))
  return out
}

export const GET = ruta("subdiario GET", async (req: Request) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso

  const url = new URL(req.url)
  const tipo = url.searchParams.get("tipo") === "compra" ? "compra" : "venta"
  const desde = url.searchParams.get("desde") ?? ""
  const hasta = url.searchParams.get("hasta") ?? ""
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
    return NextResponse.json({ error: "Falta el período" }, { status: 400 })
  }

  let comprobantes: Comprobante[]
  try {
    comprobantes = await enPaginas<Comprobante>((i, j) =>
      supabase
        .from("comprobantes")
        .select(
          `id, fecha, clase, punto_venta, numero, cliente_id, proveedor_id, moneda, tc, signo,
           neto_gravado, alicuota_iva, iva, no_gravado, exento, percepcion_iva,
           percepcion_iibb_bsas, percepcion_iibb_caba, otros_impuestos, total`
        )
        .eq("tipo", tipo)
        .eq("estado", "confirmado")
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .order("fecha", { ascending: true })
        .order("punto_venta", { ascending: true })
        .order("numero", { ascending: true })
        .order("id", { ascending: true })
        .range(i, j)
    )
  } catch (error) {
    console.error("[subdiario]", error)
    return NextResponse.json({ error: "No se pudo armar el subdiario" }, { status: 500 })
  }

  const ids = comprobantes.map((c) => c.id)
  const tabla = tipo === "venta" ? "clientes" : "proveedores"
  const idsEntidad = [
    ...new Set(comprobantes.map((c) => (tipo === "venta" ? c.cliente_id : c.proveedor_id)).filter(Boolean)),
  ] as string[]

  try {
    const [ivas, entidades, lineas] = await Promise.all([
      enLotes(ids, async (lote) => {
        const { data, error } = await supabase
          .from("comprobante_ivas")
          .select("comprobante_id, alicuota, neto, iva")
          .in("comprobante_id", lote)
        if (error) throw error
        return data ?? []
      }),
      enLotes(idsEntidad, async (lote) => {
        const { data, error } = await supabase
          .from(tabla)
          .select("id, razon_social, cuit, forma_juridica")
          .in("id", lote)
        if (error) throw error
        return data ?? []
      }),
      enLotes(ids, async (lote) => {
        const { data, error } = await supabase
          .from("libro_diario")
          .select("origen_id, cuenta_id, cuenta_codigo, cuenta_nombre, debe_ars, haber_ars")
          .eq("origen", "comprobante")
          .in("origen_id", lote)
        if (error) throw error
        return data ?? []
      }),
    ])

    const ivasDe = new Map<string, { alicuota: string; neto: number; iva: number }[]>()
    for (const r of ivas) {
      const lista = ivasDe.get(r.comprobante_id as string) ?? []
      lista.push({ alicuota: claveAlicuota(r.alicuota), neto: n(r.neto), iva: n(r.iva) })
      ivasDe.set(r.comprobante_id as string, lista)
    }
    const entidadDe = new Map(entidades.map((e) => [e.id as string, e]))

    const filas: FilaSubdiario[] = comprobantes.map((c) => {
      const signo = n(c.signo) || 1
      const tc = c.moneda === "USD" ? n(c.tc) : 1
      const ars = (v: unknown) => redondear(n(v) * tc * signo)

      const neto = vacio()
      const iva = vacio()
      let exentoPorAlicuotaCero = 0

      // Lo normal: el desglose por alícuota. Las facturas viejas sin desglose
      // tienen una sola alícuota en la cabecera.
      const renglones = ivasDe.get(c.id) ?? [
        { alicuota: claveAlicuota(c.alicuota_iva ?? 0.21), neto: n(c.neto_gravado), iva: n(c.iva) },
      ]
      for (const r of renglones) {
        if ((ALICUOTAS_SUBDIARIO as readonly string[]).includes(r.alicuota)) {
          const k = r.alicuota as AlicuotaSubdiario
          neto[k] = redondear(neto[k] + ars(r.neto))
          iva[k] = redondear(iva[k] + ars(r.iva))
        } else {
          exentoPorAlicuotaCero += ars(r.neto)
        }
      }

      const idEntidad = tipo === "venta" ? c.cliente_id : c.proveedor_id
      const e = idEntidad ? entidadDe.get(idEntidad) : undefined

      return {
        id: c.id,
        fecha: c.fecha,
        fechaComprobante: c.fecha,
        clase: c.clase,
        numero: formatearNumero(c.punto_venta, c.numero),
        entidadId: idEntidad,
        razonSocial: (e?.razon_social as string) ?? "—",
        cuit: (e?.cuit as string | null) ?? null,
        condicionIva: (e?.forma_juridica as FilaSubdiario["condicionIva"]) ?? null,
        moneda: c.moneda,
        tc: c.moneda === "USD" ? n(c.tc) : null,
        neto,
        iva,
        noGravado: ars(c.no_gravado),
        exento: redondear(ars(c.exento) + exentoPorAlicuotaCero),
        percepcionIva: ars(c.percepcion_iva),
        percepcionIibb: redondear(ars(c.percepcion_iibb_bsas) + ars(c.percepcion_iibb_caba)),
        otrosImpuestos: ars(c.otros_impuestos),
        total: ars(c.total),
      }
    })

    const totales = totalizar(filas)

    /* ── El asiento resumen, desde el mayor ─────────────────────────────── */

    const porCuenta = new Map<string, LineaResumen>()
    const asentados = new Set<string>()
    for (const l of lineas) {
      asentados.add(l.origen_id as string)
      const c = porCuenta.get(l.cuenta_id as string) ?? {
        cuentaId: l.cuenta_id as string,
        codigo: l.cuenta_codigo as string,
        nombre: l.cuenta_nombre as string,
        debe: 0,
        haber: 0,
      }
      c.debe += n(l.debe_ars)
      c.haber += n(l.haber_ars)
      porCuenta.set(c.cuentaId, c)
    }
    const lineasResumen = [...porCuenta.values()]
      .map((c) => {
        const neto = redondear(c.debe - c.haber)
        return { ...c, debe: neto > 0 ? neto : 0, haber: neto < 0 ? -neto : 0 }
      })
      .filter((c) => c.debe > 0 || c.haber > 0)
      .sort(
        (a, b) =>
          (a.debe > 0 ? 0 : 1) - (b.debe > 0 ? 0 : 1) ||
          a.codigo.localeCompare(b.codigo, "es", { numeric: true })
      )

    const cuerpo: Subdiario = {
      tipo,
      desde,
      hasta,
      filas,
      totales,
      resumen: {
        lineas: lineasResumen,
        debe: redondear(lineasResumen.reduce((s, l) => s + l.debe, 0)),
        haber: redondear(lineasResumen.reduce((s, l) => s + l.haber, 0)),
        sinAsiento: ids.filter((id) => !asentados.has(id)).length,
      },
    }
    return NextResponse.json(cuerpo)
  } catch (error) {
    console.error("[subdiario]", error)
    return NextResponse.json({ error: "No se pudo armar el subdiario" }, { status: 500 })
  }
})
