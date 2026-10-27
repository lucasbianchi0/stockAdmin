import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { ruta } from "@/lib/admin/ruta"
import { formatearNumero } from "@/lib/admin/comprobantes"
import { redondear } from "@/lib/admin/moneda"
import {
  ALICUOTAS_SUBDIARIO,
  type AlicuotaSubdiario,
  facturaLibro,
  type FilaSubdiario,
  importesEnCero,
  type LineaResumen,
  type RetencionSubdiario,
  soloComprobantes,
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
 * En ventas van además las retenciones sufridas en los cobros del período, un
 * renglón por retención —como en el libro del estudio, «RE …» con el cliente—.
 * Son informativas: el total del libro no las suma.
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
  ley_25413: number | string | null
  percepcion_ganancias: number | string | null
  percepcion_iibb_mendoza: number | string | null
  impuestos_internos: number | string | null
  total: number | string
}

type Cobro = {
  id: string
  fecha: string
  moneda: "ARS" | "USD"
  tc: number | string | null
  cliente_id: string | null
  retenciones: {
    id: string
    tipo: "ganancias" | "iva" | "iibb" | "suss"
    jurisdiccion: string | null
    importe: number | string
    numero_certificado: string | null
  }[]
}

/** En qué columna del libro de ventas cae cada retención. */
function columnaRetencion(tipo: string, jurisdiccion: string | null): RetencionSubdiario {
  if (tipo === "ganancias") return "ganancias"
  if (tipo === "iva") return "iva"
  if (tipo === "suss") return "suss"
  if (jurisdiccion === "mendoza") return "iibbMendoza"
  if (jurisdiccion === "bsas") return "iibbBsas"
  if (jurisdiccion === "caba") return "iibbCaba"
  return "iibbOtras"
}

const n = (v: unknown) => {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

/** Las claves de alícuota como las guarda la base (0.2100) → "0.21". */
const claveAlicuota = (v: unknown): string => String(Number(v))

async function enPaginas<T>(armar: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const todo: T[] = []
  for (let i = 0; ; i += PAGINA) {
    const { data, error } = await armar(i, i + PAGINA - 1)
    if (error) throw error
    todo.push(...(data ?? []))
    if (!data || data.length < PAGINA) return todo
  }
}

/**
 * Los lotes van todos a la vez y no uno detrás del otro: cada uno es una
 * consulta independiente, y en fila un subdiario de un año pagaba un viaje a
 * la base por cada 200 comprobantes. `Promise.all` respeta el orden de los
 * lotes, así que el resultado es el mismo que antes.
 */
async function enLotes<T>(ids: string[], leer: (lote: string[]) => Promise<T[]>): Promise<T[]> {
  const lotes: string[][] = []
  for (let i = 0; i < ids.length; i += 200) lotes.push(ids.slice(i, i + 200))
  return (await Promise.all(lotes.map(leer))).flat()
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

  /*
   * El período se arma por la FECHA DE REGISTRO (pedido del contador): una
   * factura de septiembre registrada en octubre va al subdiario de octubre. La
   * vista `comprobantes_fecha_registro` la resuelve —la del comprobante salvo
   * que se haya cargado otra—, y recién después se leen esas facturas.
   */
  /*
   * Las facturas del período y los cobros con retenciones no dependen unas de
   * otros: van a la vez. Cada una conserva su propio mensaje en el log para
   * saber cuál falló.
   */
  const registroDe = new Map<string, string>()
  const leerComprobantes = async (): Promise<Comprobante[]> => {
    const registros = await enPaginas<{ comprobante_id: string; fecha_registro: string }>((i, j) =>
      supabase
        .from("comprobantes_fecha_registro")
        .select("comprobante_id, fecha_registro")
        .gte("fecha_registro", desde)
        .lte("fecha_registro", hasta)
        .order("comprobante_id")
        .range(i, j)
    )
    for (const r of registros) registroDe.set(r.comprobante_id, r.fecha_registro)

    return enLotes([...registroDe.keys()], async (lote) => {
      const { data, error } = await supabase
        .from("comprobantes")
        .select(
          `id, fecha, clase, punto_venta, numero, cliente_id, proveedor_id, moneda, tc, signo,
           neto_gravado, alicuota_iva, iva, no_gravado, exento, percepcion_iva,
           percepcion_iibb_bsas, percepcion_iibb_caba, otros_impuestos, ley_25413,
           percepcion_ganancias, percepcion_iibb_mendoza, impuestos_internos, total`
        )
        .eq("tipo", tipo)
        .eq("estado", "confirmado")
        .in("id", lote)
      if (error) throw error
      return (data ?? []) as Comprobante[]
    })
  }

  /*
   * Las retenciones sufridas, por la fecha del cobro: es la que figura en el
   * recibo y la que usa el estudio. Solo en ventas; en compras las retenciones
   * son las que practica Accedra y no van en este libro.
   */
  const leerCobros = async (): Promise<Cobro[]> => {
    if (tipo !== "venta") return []
    const todos = await enPaginas<Cobro>((i, j) =>
      supabase
        .from("pagos")
        .select(
          `id, fecha, moneda, tc, cliente_id,
           retenciones:pago_retenciones (id, tipo, jurisdiccion, importe, numero_certificado)`
        )
        .eq("tipo", "cobro")
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .order("id")
        .range(i, j)
        .returns<Cobro[]>()
    )
    return todos.filter((c) => (c.retenciones ?? []).length > 0)
  }

  const [resComprobantes, resCobros] = await Promise.allSettled([leerComprobantes(), leerCobros()])
  if (resComprobantes.status === "rejected") {
    console.error("[subdiario]", resComprobantes.reason)
    return NextResponse.json({ error: "No se pudo armar el subdiario" }, { status: 500 })
  }
  if (resCobros.status === "rejected") {
    console.error("[subdiario retenciones]", resCobros.reason)
    return NextResponse.json({ error: "No se pudo armar el subdiario" }, { status: 500 })
  }
  const comprobantes = resComprobantes.value
  const cobros = resCobros.value

  const ids = comprobantes.map((c) => c.id)
  const tabla = tipo === "venta" ? "clientes" : "proveedores"
  const idsEntidad = [
    ...new Set(
      [
        ...comprobantes.map((c) => (tipo === "venta" ? c.cliente_id : c.proveedor_id)),
        ...cobros.map((c) => c.cliente_id),
      ].filter(Boolean)
    ),
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

    const facturas: FilaSubdiario[] = comprobantes.map((c) => {
      const signo = n(c.signo) || 1
      const tc = c.moneda === "USD" ? n(c.tc) : 1
      const ars = (v: unknown) => redondear(n(v) * tc * signo)

      const fila = importesEnCero()
      const { neto, iva } = fila
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

      fila.gravado = redondear(ALICUOTAS_SUBDIARIO.reduce((a, k) => a + neto[k], 0))
      fila.noGravado = ars(c.no_gravado)
      fila.exento = redondear(ars(c.exento) + exentoPorAlicuotaCero)
      // El IVA de la cabecera y no la suma del desglose: es contra el que cuadra
      // el asiento, y un centavo de redondeo entre los dos no puede separar el
      // libro del mayor.
      fila.ivaTotal = ars(c.iva)
      fila.percepcionIva = ars(c.percepcion_iva)
      fila.percepcionIibbBsas = ars(c.percepcion_iibb_bsas)
      fila.percepcionIibbCaba = ars(c.percepcion_iibb_caba)
      fila.ley25413 = ars(c.ley_25413)
      fila.percepcionGanancias = ars(c.percepcion_ganancias)
      fila.impuestosInternos = ars(c.impuestos_internos)
      fila.total = ars(c.total)

      /*
       * La factura C de un monotributista no discrimina IVA: el libro la pone
       * entera en MONOTRIBUTO, cualquiera sea el campo en que se cargó el
       * importe. Lo mismo su nota de crédito, en negativo.
       */
      if (/^(FC|NC|ND)C$/.test(c.clase)) {
        fila.monotributo = redondear(fila.gravado + fila.noGravado + fila.exento)
        fila.gravado = 0
        fila.noGravado = 0
        fila.exento = 0
        fila.neto = { "0.21": 0, "0.105": 0, "0.27": 0 }
      }

      /*
       * Lo que el libro no tiene como columna va a OTROS, así el TOTAL sigue
       * siendo la suma de lo que se ve. En compras: Mendoza, los internos (que
       * en una compra son costo) y los otros impuestos. En ventas: el no
       * gravado, las percepciones practicadas y los otros impuestos —y lo de
       * compras, que la API no acepta en una venta pero una fila vieja podría
       * tener—.
       */
      if (tipo === "compra") {
        fila.otros = redondear(ars(c.otros_impuestos) + fila.impuestosInternos + ars(c.percepcion_iibb_mendoza))
        fila.impuestosInternos = 0
      } else {
        fila.otros = redondear(
          fila.noGravado +
            fila.percepcionIva +
            fila.percepcionIibbBsas +
            fila.percepcionIibbCaba +
            ars(c.otros_impuestos) +
            fila.ley25413 +
            fila.percepcionGanancias +
            ars(c.percepcion_iibb_mendoza)
        )
        fila.noGravado = 0
        fila.percepcionIva = 0
        fila.percepcionIibbBsas = 0
        fila.percepcionIibbCaba = 0
        fila.ley25413 = 0
        fila.percepcionGanancias = 0
      }

      const idEntidad = tipo === "venta" ? c.cliente_id : c.proveedor_id
      const e = idEntidad ? entidadDe.get(idEntidad) : undefined

      return {
        ...fila,
        id: c.id,
        origen: "comprobante" as const,
        fecha: registroDe.get(c.id) ?? c.fecha,
        fechaComprobante: c.fecha,
        clase: c.clase,
        numero: formatearNumero(c.punto_venta, c.numero),
        factura: facturaLibro(c.clase, tipo, c.punto_venta, c.numero),
        entidadId: idEntidad,
        razonSocial: (e?.razon_social as string) ?? "—",
        cuit: (e?.cuit as string | null) ?? null,
        condicionIva: (e?.forma_juridica as FilaSubdiario["condicionIva"]) ?? null,
        moneda: c.moneda,
        tc: c.moneda === "USD" ? n(c.tc) : null,
      }
    })

    // Una por retención, en negativo: es lo que el cliente descontó del cobro.
    const retenciones: FilaSubdiario[] = cobros.flatMap((p) => {
      const tc = p.moneda === "USD" ? n(p.tc) : 1
      const e = p.cliente_id ? entidadDe.get(p.cliente_id) : undefined
      return (p.retenciones ?? []).map((r) => {
        const fila = importesEnCero()
        const importe = -redondear(n(r.importe) * tc)
        fila.ret[columnaRetencion(r.tipo, r.jurisdiccion)] = importe
        fila.total = importe
        const certificado = r.numero_certificado?.trim() || "s/n"
        return {
          ...fila,
          id: `ret-${r.id}`,
          origen: "retencion" as const,
          fecha: p.fecha,
          fechaComprobante: p.fecha,
          clase: "RE",
          numero: certificado,
          factura: `RE ${certificado}`,
          entidadId: p.cliente_id,
          razonSocial: (e?.razon_social as string) ?? "—",
          cuit: (e?.cuit as string | null) ?? null,
          condicionIva: (e?.forma_juridica as FilaSubdiario["condicionIva"]) ?? null,
          moneda: p.moneda,
          tc: p.moneda === "USD" ? n(p.tc) : null,
        }
      })
    })

    // Todo por fecha, y dentro del día por cómo se lee en el libro.
    const filas = [...facturas, ...retenciones].sort(
      (a, b) =>
        a.fecha.localeCompare(b.fecha) ||
        a.factura.localeCompare(b.factura, "es") ||
        a.id.localeCompare(b.id)
    )

    const totales = totalizar(soloComprobantes(filas))

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
