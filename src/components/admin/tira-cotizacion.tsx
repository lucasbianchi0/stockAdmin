"use client"

import { RefreshCw } from "lucide-react"

import { Skeleton } from "@/components/ui/states"
import { formatearTc } from "@/lib/admin/moneda"
import { useCotizacion } from "@/lib/admin/use-cotizacion"
import { cn } from "@/lib/utils"

/**
 * La cotización del día, en la cabecera de administración.
 *
 * Es una **referencia**, no una métrica: nadie hace nada distinto porque el
 * dólar esté en 1.520 en vez de 1.515; simplemente necesita verlo antes de
 * cargar algo en dólares. Por eso vive en la barra de título y no ocupa una
 * tarjeta — el lugar destacado es para lo que genera trabajo, que es la
 * cobranza.
 *
 * Que sea la misma fuente que usa el módulo de productos es a propósito: si la
 * factura de un cliente se valuara con un dólar distinto del que se usó para
 * cotizarle, los números de las dos pantallas no cerrarían y no habría forma de
 * explicar la diferencia.
 */
export function TiraCotizacion({ className }: { className?: string }) {
  const { venta, actualizado, cargando, error, refrescar } = useCotizacion()

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-1.5",
        className
      )}
      title={
        error
          ? "No se pudo actualizar — se muestra la última conocida"
          : actualizado
            ? `Actualizada ${new Date(actualizado).toLocaleString("es-AR", {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}`
            : undefined
      }
    >
      <div className="leading-tight">
        <p className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-ink-subtle">
          Dólar venta BNA
        </p>
        {cargando && venta === null ? (
          <Skeleton className="mt-1 h-4 w-16" />
        ) : venta === null ? (
          <p className="text-[13px] font-medium text-danger-text">sin dato</p>
        ) : (
          <p className="num text-[14px] font-bold tracking-[-0.02em] text-ink">
            $ {formatearTc(venta)}
          </p>
        )}
      </div>

      <button
        onClick={refrescar}
        disabled={cargando}
        aria-label="Actualizar cotización"
        className="rounded p-1 text-ink-faint transition-colors hover:bg-surface-muted hover:text-ink disabled:opacity-40"
      >
        <RefreshCw className={cn("h-3 w-3", cargando && "animate-spin")} />
      </button>
    </div>
  )
}
