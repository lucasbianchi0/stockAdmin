import { supabase } from "@/lib/supabase"
import type { AsientoBorrador, LineaBorrador, TipoBorrador } from "@/lib/admin/asientos-borradores"
import { TIPOS_BORRADOR, problemaDeLinea } from "@/lib/admin/asientos-borradores"

/** Borradores de asientos manuales y la propuesta de cierre. Sólo servidor. */

export class ErrorBorrador extends Error {}

function aBorrador(f: Record<string, unknown>): AsientoBorrador {
  return {
    id: f.id as string,
    tipo: f.tipo as TipoBorrador,
    fecha: f.fecha as string,
    descripcion: f.descripcion as string,
    lineas: (f.lineas as LineaBorrador[]) ?? [],
    estado: f.estado as AsientoBorrador["estado"],
    createdAt: f.created_at as string,
    updatedAt: f.updated_at as string,
  }
}

export async function listarBorradores(tipos: TipoBorrador[]): Promise<AsientoBorrador[]> {
  const { data, error } = await supabase
    .from("asientos_borradores")
    .select("*")
    .in("tipo", tipos)
    .neq("estado", "descartado")
    .order("fecha", { ascending: false })
  if (error) throw error
  return (data ?? []).map(aBorrador)
}

export type DatosBorrador = Pick<AsientoBorrador, "tipo" | "fecha" | "descripcion" | "lineas">

function validar(d: DatosBorrador): DatosBorrador {
  if (!TIPOS_BORRADOR.includes(d.tipo)) throw new ErrorBorrador("Tipo de asiento desconocido")
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha)) throw new ErrorBorrador("Falta la fecha")
  if (!d.descripcion?.trim()) throw new ErrorBorrador("Falta la descripción")
  const lineas = (d.lineas ?? []).filter((l) => l.cuentaId || l.debe || l.haber)
  for (const [i, l] of lineas.entries()) {
    const p = problemaDeLinea(l)
    if (p) throw new ErrorBorrador(`Renglón ${i + 1}: ${p}`)
  }
  return { ...d, descripcion: d.descripcion.trim(), lineas }
}

export async function guardarBorrador(d: DatosBorrador, usuarioId: string | null, id?: string) {
  const limpio = validar(d)
  const fila = {
    tipo: limpio.tipo,
    fecha: limpio.fecha,
    descripcion: limpio.descripcion,
    lineas: limpio.lineas,
    updated_at: new Date().toISOString(),
  }
  const q = id
    ? supabase.from("asientos_borradores").update(fila).eq("id", id).eq("estado", "borrador")
    : supabase.from("asientos_borradores").insert({ ...fila, created_by: usuarioId })
  const { data, error } = await q.select("*").single()
  if (error) throw error
  return aBorrador(data)
}

export async function descartarBorrador(id: string) {
  const { error } = await supabase
    .from("asientos_borradores")
    .update({ estado: "descartado", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("estado", "borrador")
  if (error) throw error
}

/**
 * La propuesta de cierre de un ejercicio: cada cuenta de resultado (ganancias y
 * pérdidas) se lleva a cero, y la diferencia va a 410 Resultados del Ejercicio.
 * Se arma con lo asentado en el libro diario entre el inicio y el fin.
 */
export async function proponerCierre(ejercicioId: number, usuarioId: string | null) {
  const { data: e, error } = await supabase
    .from("ejercicios_resumen")
    .select("id, nombre, inicio, fin")
    .eq("id", ejercicioId)
    .maybeSingle()
  if (error) throw error
  if (!e) throw new ErrorBorrador("Ese ejercicio no existe")

  const { data: resultado } = await supabase
    .from("plan_cuentas")
    .select("id, codigo, nombre")
    .eq("codigo", "410")
    .maybeSingle()
  if (!resultado) throw new ErrorBorrador("No está la cuenta 410 Resultados del Ejercicio en el plan")

  type Fila = { cuenta_id: string; cuenta_codigo: string; cuenta_nombre: string; debe_ars: number; haber_ars: number }
  const filas: Fila[] = []
  for (let i = 0; ; i += 1000) {
    const { data, error: e2 } = await supabase
      .from("libro_diario")
      .select("cuenta_id, cuenta_codigo, cuenta_nombre, debe_ars, haber_ars")
      .in("cuenta_tipo", ["ingreso", "egreso"])
      .gte("fecha", e.inicio as string)
      .lte("fecha", e.fin as string)
      .order("linea_id")
      .range(i, i + 999)
    if (e2) throw e2
    filas.push(...((data ?? []) as Fila[]))
    if (!data || data.length < 1000) break
  }

  const saldos = new Map<string, { codigo: string; nombre: string; saldo: number }>()
  for (const f of filas) {
    const s = saldos.get(f.cuenta_id) ?? { codigo: f.cuenta_codigo, nombre: f.cuenta_nombre, saldo: 0 }
    s.saldo += Number(f.debe_ars) - Number(f.haber_ars)
    saldos.set(f.cuenta_id, s)
  }

  const r2 = (n: number) => Math.round(n * 100) / 100
  const lineas: LineaBorrador[] = [...saldos.entries()]
    .map(([cuentaId, s]) => ({ cuentaId, ...s, saldo: r2(s.saldo) }))
    .filter((s) => s.saldo !== 0)
    .sort((a, b) => a.codigo.localeCompare(b.codigo, "es", { numeric: true }))
    // Saldo deudor (una pérdida) se cancela al haber; acreedor (una ganancia), al debe.
    .map((s) => ({
      cuentaId: s.cuentaId,
      codigo: s.codigo,
      nombre: s.nombre,
      debe: s.saldo < 0 ? -s.saldo : 0,
      haber: s.saldo > 0 ? s.saldo : 0,
      detalle: null,
    }))

  if (!lineas.length) throw new ErrorBorrador(`El ejercicio ${e.nombre} no tiene movimientos en cuentas de resultado`)

  const debe = lineas.reduce((t, l) => t + l.debe, 0)
  const haber = lineas.reduce((t, l) => t + l.haber, 0)
  const dif = r2(debe - haber)
  lineas.push({
    cuentaId: resultado.id as string,
    codigo: resultado.codigo as string,
    nombre: resultado.nombre as string,
    // Más debe que haber = ganancia: el resultado queda al haber.
    debe: dif < 0 ? -dif : 0,
    haber: dif > 0 ? dif : 0,
    detalle: dif > 0 ? "Ganancia del ejercicio" : "Pérdida del ejercicio",
  })

  return guardarBorrador(
    {
      tipo: "cierre",
      fecha: e.fin as string,
      descripcion: `Cierre del ejercicio ${e.nombre}: refundición de cuentas de resultado`,
      lineas,
    },
    usuarioId
  )
}
