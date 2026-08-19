import { supabase } from "@/lib/supabase"
import type { TipoComprobante } from "@/lib/admin/comprobantes"
import { redondear } from "@/lib/admin/moneda"
import { IMPACTO_VACIO, type Impacto } from "@/lib/admin/impacto"

/**
 * Lo que realmente pasó al guardar estos comprobantes.
 *
 * Se lee de la base **después** del guardado y no se deduce de lo que se mandó,
 * porque las dos cosas no siempre coinciden: el asiento lo escribe un trigger y
 * puede no escribirlo —si falta la cuenta imputada, `asiento_de_comprobante`
 * corta y devuelve null sin fallar—. Un resumen que dijera "3 asientos" porque
 * se confirmaron 3 facturas sería exactamente el tipo de mentira tranquilizadora
 * que hace que el descuadre se descubra al cierre.
 *
 * Son dos consultas para cualquier cantidad de comprobantes: no escala con el
 * tamaño del lote.
 */
export async function impactoDeComprobantes(
  tipo: TipoComprobante,
  ids: string[],
  entidadesNuevas: string[] = []
): Promise<Impacto> {
  const base = { ...IMPACTO_VACIO(tipo), entidadesNuevas }
  if (ids.length === 0) return base

  const [{ data: filas }, { data: asientos }] = await Promise.all([
    supabase
      .from("comprobantes")
      .select(
        "id, estado, total, moneda, signo, fecha_vencimiento, cuenta_contable_id, cliente_id, proveedor_id"
      )
      .in("id", ids),
    supabase.from("asientos").select("origen_id").eq("origen", "comprobante").in("origen_id", ids),
  ])

  const comprobantes = (filas ?? []) as {
    id: string
    estado: string
    total: number | string
    moneda: "ARS" | "USD"
    signo: number
    fecha_vencimiento: string | null
    cuenta_contable_id: string | null
    cliente_id: string | null
    proveedor_id: string | null
  }[]

  if (comprobantes.length === 0) return base

  const conAsiento = new Set((asientos ?? []).map((a) => a.origen_id as string))

  // El estado del lote es el del conjunto: si quedó alguno en borrador, el
  // resumen no puede decir que todo impactó. Prevalece el más conservador.
  const todosConfirmados = comprobantes.every((c) => c.estado === "confirmado")

  const limite = enDias(7)
  const entidades = new Set<string>()
  let deudaArs = 0
  let deudaUsd = 0
  let vencenPronto = 0
  let sinAsiento = 0

  for (const c of comprobantes) {
    const entidadId = tipo === "compra" ? c.proveedor_id : c.cliente_id
    if (entidadId) entidades.add(entidadId)

    if (c.estado !== "confirmado") continue

    // El signo es lo que hace que una nota de crédito reste en vez de sumar: es
    // deuda que se cancela, no deuda nueva.
    const importe = Number(c.total) * (Number(c.signo) === -1 ? -1 : 1)
    if (c.moneda === "USD") deudaUsd += importe
    else deudaArs += importe

    if (c.fecha_vencimiento && c.fecha_vencimiento <= limite) vencenPronto++
    if (!conAsiento.has(c.id)) sinAsiento++
  }

  return {
    ...base,
    estado: todosConfirmados ? "confirmado" : "borrador",
    comprobantes: comprobantes.length,
    entidades: entidades.size,
    asientos: conAsiento.size,
    sinAsiento,
    deuda: { ARS: redondear(deudaArs), USD: redondear(deudaUsd) },
    vencenPronto,
  }
}

function enDias(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}
