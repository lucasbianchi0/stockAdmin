"use client"

import { X } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * La fila de herramientas arriba de una tabla, que se convierte en la de
 * acciones cuando hay filas elegidas: "3 seleccionados · Enviar a mi CRM ▾".
 *
 * Es lo que muestra el boceto, y es como lo resuelven las herramientas de
 * contactos: las acciones aparecen donde está la vista, no en una barra que
 * flota sobre la tabla y tapa las últimas filas.
 */
export function BarraTabla({
  seleccionados,
  rotuloSeleccion,
  onLimpiar,
  acciones,
  children,
}: {
  seleccionados: number
  rotuloSeleccion: (n: number) => string
  onLimpiar: () => void
  /** Lo que se puede hacer con lo elegido. */
  acciones: React.ReactNode
  /** La fila normal: buscador, filtros. */
  children: React.ReactNode
}) {
  const hay = seleccionados > 0
  return (
    <div className="relative min-h-[52px] border-b border-line">
      <div
        className={cn(
          "flex flex-wrap items-center gap-2 px-3 py-2.5 transition-opacity duration-150 sm:px-4",
          hay && "pointer-events-none invisible opacity-0"
        )}
      >
        {children}
      </div>
      {hay && (
        <div className="absolute inset-0 flex items-center gap-2 bg-brand-50/70 px-3 animate-in fade-in-0 duration-150 sm:px-4">
          <button
            type="button"
            onClick={onLimpiar}
            aria-label="Limpiar selección"
            className="rounded-md p-1 text-ink-muted transition-colors hover:bg-brand-100 hover:text-ink"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <span className="num mr-2 text-[13px] font-medium text-ink">
            {rotuloSeleccion(seleccionados)}
          </span>
          <div className="flex min-w-0 items-center gap-1.5">{acciones}</div>
        </div>
      )}
    </div>
  )
}
