import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { ruta } from "@/lib/admin/ruta"
import { redondear } from "@/lib/admin/moneda"

/**
 * Libro diario resumido: un asiento por mes con cada cuenta neteada.
 *
 * Es el punto 5 del pedido del contador —«que mensualmente muestre un asiento
 * agrupando todas las cuentas del mes»— y sirve para copiar al libro rubricado.
 * Es sólo lectura: los asientos registrados siguen siendo los de cada documento.
 *
 * ── POR QUE SE PAGINA Y NO SE CORTA CON UN TOPE ──
 *
 * El diario por asiento puede mostrar "los más recientes" y avisar. Un resumen
 * no: un total de mes al que le faltan líneas no cuadra, y un asiento que no
 * cuadra en un libro contable es peor que no tenerlo. Se leen todas las líneas
 * en páginas, y sólo si el período es desproporcionado se corta y se avisa.
 */

const PAGINA = 1000
const TOPE = 100_000

type Fila = {
  asiento_id: string
  fecha: string
  cuenta_id: string
  cuenta_codigo: string
  cuenta_nombre: string
  debe_ars: number | string
  haber_ars: number | string
}

export const GET = ruta("diario mensual GET", async (req: Request) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso

  const url = new URL(req.url)
  const desde = url.searchParams.get("desde") ?? ""
  const hasta = url.searchParams.get("hasta") ?? ""

  const filas: Fila[] = []
  let truncado = false

  for (let inicio = 0; ; inicio += PAGINA) {
    let query = supabase
      .from("libro_diario")
      .select("asiento_id, fecha, cuenta_id, cuenta_codigo, cuenta_nombre, debe_ars, haber_ars")
    if (desde) query = query.gte("fecha", desde)
    if (hasta) query = query.lte("fecha", hasta)

    // El orden por línea hace que las páginas no se pisen ni dejen huecos.
    const { data, error } = await query
      .order("fecha", { ascending: true })
      .order("linea_id", { ascending: true })
      .range(inicio, inicio + PAGINA - 1)

    if (error) {
      console.error("[diario mensual]", error)
      return NextResponse.json({ error: "No se pudo agrupar el libro diario" }, { status: 500 })
    }

    filas.push(...((data ?? []) as Fila[]))
    if (!data || data.length < PAGINA) break
    if (filas.length >= TOPE) {
      truncado = true
      break
    }
  }

  type Acumulado = { codigo: string; nombre: string; debe: number; haber: number }
  const porMes = new Map<string, { asientos: Set<string>; cuentas: Map<string, Acumulado> }>()

  for (const f of filas) {
    const mes = f.fecha.slice(0, 7)
    let m = porMes.get(mes)
    if (!m) {
      m = { asientos: new Set(), cuentas: new Map() }
      porMes.set(mes, m)
    }
    m.asientos.add(f.asiento_id)
    const c = m.cuentas.get(f.cuenta_id) ?? {
      codigo: f.cuenta_codigo,
      nombre: f.cuenta_nombre,
      debe: 0,
      haber: 0,
    }
    c.debe += Number(f.debe_ars)
    c.haber += Number(f.haber_ars)
    m.cuentas.set(f.cuenta_id, c)
  }

  const meses = [...porMes.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([mes, m]) => {
      // Cada cuenta queda de un solo lado, por su neto: es como se copia un
      // resumen al libro. Los débitos van primero, como en cualquier asiento.
      const lineas = [...m.cuentas.entries()]
        .map(([cuentaId, c]) => {
          const neto = redondear(c.debe - c.haber)
          return {
            cuentaId,
            codigo: c.codigo,
            nombre: c.nombre,
            debe: neto > 0 ? neto : 0,
            haber: neto < 0 ? -neto : 0,
          }
        })
        .filter((l) => l.debe > 0 || l.haber > 0)
        .sort(
          (a, b) =>
            (a.debe > 0 ? 0 : 1) - (b.debe > 0 ? 0 : 1) ||
            // Por número: "25" va antes que "201", no después.
            a.codigo.localeCompare(b.codigo, "es", { numeric: true })
        )

      return {
        mes,
        asientos: m.asientos.size,
        lineas,
        debe: redondear(lineas.reduce((s, l) => s + l.debe, 0)),
        haber: redondear(lineas.reduce((s, l) => s + l.haber, 0)),
      }
    })

  return NextResponse.json({ meses, truncado })
})
