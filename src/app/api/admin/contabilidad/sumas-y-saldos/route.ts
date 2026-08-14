import { NextResponse } from "next/server"

import { exigirModulo } from "@/lib/guard-api"
import { supabase } from "@/lib/supabase"
import { ruta } from "@/lib/admin/ruta"
import { redondear } from "@/lib/admin/moneda"
import { TIPOS_CUENTA, type TipoCuenta } from "@/lib/admin/cuentas-vocabulario"
import type { FilaSumasSaldos, SumasYSaldos } from "@/lib/admin/asientos"

/**
 * Sumas y saldos: el estado de todas las cuentas.
 *
 * Dos caminos a propósito:
 *
 *  · **Sin filtro de fechas** se lee la vista `sumas_y_saldos`, que agrega en la
 *    base. Es exacta sin importar cuántos asientos haya, y es la que responde la
 *    pregunta que importa: *¿la contabilidad cierra?*
 *  · **Con filtro** hay que agregar acá, porque PostgREST no hace `group by` con
 *    un `where` arbitrario. Se acota con un tope y se avisa si se cortó, en vez
 *    de devolver un total parcial haciéndolo pasar por completo.
 *
 * El `cuadra` no es decorativo. Si los débitos no igualan a los créditos hay un
 * asiento mal escrito en la base, y eso invalida cualquier balance que salga de
 * acá. Vale más una pantalla que lo grita que un número prolijo y falso.
 */

const TOPE = 20000

export const GET = ruta("sumas y saldos GET", async (req: Request) => {
  const sinPermiso = await exigirModulo("administracion")
  if (sinPermiso) return sinPermiso

  const url = new URL(req.url)
  const desde = url.searchParams.get("desde") ?? ""
  const hasta = url.searchParams.get("hasta") ?? ""
  const conMovimientos = url.searchParams.get("todas") !== "1"

  let filas: FilaSumasSaldos[] = []
  let truncado = false

  if (!desde && !hasta) {
    const { data, error } = await supabase
      .from("sumas_y_saldos")
      .select("cuenta_id, codigo, nombre, tipo, debe_ars, haber_ars, saldo_ars, movimientos")
      .order("codigo", { ascending: true })

    if (error) {
      console.error("[sumas y saldos]", error)
      return NextResponse.json({ error: "No se pudo cargar sumas y saldos" }, { status: 500 })
    }

    filas = (data ?? []).map((f) => ({
      cuentaId: f.cuenta_id as string,
      codigo: f.codigo as string,
      nombre: f.nombre as string,
      tipo: f.tipo as TipoCuenta,
      debeArs: Number(f.debe_ars),
      haberArs: Number(f.haber_ars),
      saldoArs: Number(f.saldo_ars),
      movimientos: Number(f.movimientos),
    }))
  } else {
    let query = supabase
      .from("libro_diario")
      .select("cuenta_id, cuenta_codigo, cuenta_nombre, cuenta_tipo, debe_ars, haber_ars")

    if (desde) query = query.gte("fecha", desde)
    if (hasta) query = query.lte("fecha", hasta)

    const { data, error } = await query.limit(TOPE)

    if (error) {
      console.error("[sumas y saldos período]", error)
      return NextResponse.json({ error: "No se pudo cargar sumas y saldos" }, { status: 500 })
    }

    const lineas = data ?? []
    truncado = lineas.length >= TOPE

    const acc = new Map<string, FilaSumasSaldos>()
    for (const l of lineas) {
      const id = l.cuenta_id as string
      let fila = acc.get(id)
      if (!fila) {
        fila = {
          cuentaId: id,
          codigo: l.cuenta_codigo as string,
          nombre: l.cuenta_nombre as string,
          tipo: l.cuenta_tipo as TipoCuenta,
          debeArs: 0,
          haberArs: 0,
          saldoArs: 0,
          movimientos: 0,
        }
        acc.set(id, fila)
      }
      fila.debeArs = redondear(fila.debeArs + Number(l.debe_ars))
      fila.haberArs = redondear(fila.haberArs + Number(l.haber_ars))
      fila.saldoArs = redondear(fila.debeArs - fila.haberArs)
      fila.movimientos++
    }

    filas = [...acc.values()].sort((a, b) => a.codigo.localeCompare(b.codigo, "es", { numeric: true }))
  }

  const visibles = conMovimientos ? filas.filter((f) => f.movimientos > 0) : filas

  const debe = redondear(visibles.reduce((a, f) => a + f.debeArs, 0))
  const haber = redondear(visibles.reduce((a, f) => a + f.haberArs, 0))

  const porRubro = TIPOS_CUENTA.map((tipo) => {
    const delRubro = visibles.filter((f) => f.tipo === tipo)
    return {
      tipo,
      saldo: redondear(delRubro.reduce((a, f) => a + f.saldoArs, 0)),
      cuentas: delRubro.length,
    }
  }).filter((r) => r.cuentas > 0)

  const respuesta: SumasYSaldos & { truncado: boolean } = {
    filas: visibles,
    totales: { debe, haber, diferencia: redondear(debe - haber) },
    cuadra: redondear(debe - haber) === 0,
    porRubro,
    truncado,
  }

  return NextResponse.json(respuesta)
})
