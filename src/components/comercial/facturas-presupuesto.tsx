"use client"

import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { FileCheck2, Loader2, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { formatearFecha } from "@/lib/admin/fecha"
import { formatearImporte } from "@/lib/admin/moneda"
import { claves, mensajeError, pedirJson, useInvalidarAdmin } from "@/lib/admin/query"
import type { FacturaVinculable } from "@/lib/comercial/presupuesto-facturas-server"

/**
 * Las facturas de venta de un presupuesto facturado.
 *
 * Es lo que arma el detalle por factura de los Puntos (la comisión) que pidió
 * el contador. Se ofrecen las ventas confirmadas del mismo cliente, las más
 * recientes primero, y un presupuesto facturado en partes admite varias.
 */
export function FacturasPresupuesto({
  presupuestoId,
  totalConIva,
  moneda,
}: {
  presupuestoId: string
  /** Para proponer la factura cuyo total coincide con el del presupuesto. */
  totalConIva: number
  moneda: "ARS" | "USD"
}) {
  const url = `/api/comercial/presupuestos/${presupuestoId}/facturas`
  const invalidar = useInvalidarAdmin()
  const [elegida, setElegida] = useState("")
  const [trabajando, setTrabajando] = useState(false)
  const query = useQuery({
    queryKey: claves.url(url),
    queryFn: ({ signal }) =>
      pedirJson<{ vinculadas: FacturaVinculable[]; candidatas: FacturaVinculable[] }>(url, { signal }),
  })
  const vinculadas = query.data?.vinculadas ?? []
  const candidatas = query.data?.candidatas ?? []
  const coincide = (f: FacturaVinculable) => f.moneda === moneda && Math.abs(f.total - totalConIva) < 0.5

  // Si una factura del cliente tiene exactamente el total del presupuesto y
  // todavía no hay ninguna vinculada, viene elegida: casi siempre es esa.
  useEffect(() => {
    if (elegida || vinculadas.length) return
    const sugerida = candidatas.find(coincide)
    if (sugerida) setElegida(sugerida.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data])

  const accion = async (init: RequestInit, ok: string) => {
    setTrabajando(true)
    try {
      await pedirJson(init.method === "DELETE" ? `${url}?comprobanteId=${elegida}` : url, init)
      await invalidar()
      setElegida("")
      toast.success(ok)
    } catch (e) {
      toast.error(mensajeError(e, "No se pudo guardar"))
    } finally {
      setTrabajando(false)
    }
  }

  const quitar = async (id: string) => {
    setTrabajando(true)
    try {
      await pedirJson(`${url}?comprobanteId=${id}`, { method: "DELETE" })
      await invalidar()
      toast.success("Factura desvinculada")
    } catch (e) {
      toast.error(mensajeError(e, "No se pudo desvincular"))
    } finally {
      setTrabajando(false)
    }
  }

  return (
    <section className="panel p-5">
      <div className="mb-3 flex items-start gap-3">
        <FileCheck2 className="mt-0.5 h-4 w-4 text-ink-muted" />
        <div>
          <p className="text-[13.5px] font-semibold text-ink">Factura de venta</p>
          <p className="text-[12px] text-ink-muted">
            Con qué factura se facturó. Es lo que muestra el reporte de Comercial en el detalle de los Puntos.
          </p>
        </div>
      </div>

      {vinculadas.length > 0 && (
        <ul className="mb-3 space-y-1.5">
          {vinculadas.map((f) => (
            <li key={f.id} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2">
              <span className="font-mono text-[12.5px] font-semibold text-ink">{f.etiqueta}</span>
              <span className="text-[12px] text-ink-muted">{formatearFecha(f.fecha)}</span>
              <span className="num ml-auto text-[12.5px] text-ink-secondary">{formatearImporte(f.total, f.moneda)}</span>
              <button
                onClick={() => quitar(f.id)}
                disabled={trabajando}
                aria-label={`Desvincular ${f.etiqueta}`}
                className="rounded-md p-1 text-ink-faint hover:bg-surface-muted hover:text-ink"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {query.isPending ? (
        <p className="text-[12px] text-ink-muted">Buscando las facturas del cliente…</p>
      ) : candidatas.length === 0 ? (
        vinculadas.length === 0 && (
          <p className="text-[12.5px] text-ink-muted">
            Este cliente no tiene facturas de venta confirmadas todavía. Cargala en Administración y volvé.
          </p>
        )
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Factura a vincular"
            value={elegida}
            onChange={(e) => setElegida(e.target.value)}
            className="h-9 min-w-[280px] rounded-md border border-line bg-surface px-2 text-[12.5px] text-ink"
          >
            <option value="">
              {vinculadas.length ? "Agregar otra factura…" : "Elegí la factura de este presupuesto…"}
            </option>
            {candidatas.map((f) => (
              <option key={f.id} value={f.id}>
                {f.etiqueta} · {formatearFecha(f.fecha)} · {formatearImporte(f.total, f.moneda)}
                {coincide(f) ? " · coincide con el total" : ""}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            disabled={!elegida || trabajando}
            onClick={() =>
              accion(
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ comprobanteId: elegida }),
                },
                "Factura vinculada"
              )
            }
          >
            {trabajando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Vincular
          </Button>
        </div>
      )}
    </section>
  )
}
