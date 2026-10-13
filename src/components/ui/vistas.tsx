"use client"

import { cn } from "@/lib/utils"

/**
 * Pestañas de vista con su cantidad: "Todos 44 · En seguimiento 19".
 *
 * Es la forma en que las herramientas de contactos y CRM resumen una base: en
 * vez de tarjetas con números arriba de la tabla, las cantidades viven en las
 * vistas que las filtran. Un número que además es un botón dice más que uno
 * que solo se mira.
 */
export function Vistas<T extends string>({
  vistas,
  activa,
  onCambio,
  extra,
  className,
}: {
  vistas: { id: T; rotulo: string; cantidad?: number; punto?: string }[]
  activa: T
  onCambio: (id: T) => void
  /** Lo que va a la derecha de la fila (un resumen, un aviso). */
  extra?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex items-end gap-4 border-b border-line", className)}>
      <nav className="-mb-px flex min-w-0 flex-1 gap-5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {vistas.map((v) => {
          const on = v.id === activa
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => onCambio(v.id)}
              aria-pressed={on}
              className={cn(
                "flex shrink-0 items-center gap-1.5 border-b-2 pb-2.5 pt-1 text-[13px] transition-colors",
                on
                  ? "border-ink font-medium text-ink"
                  : "border-transparent text-ink-muted hover:text-ink"
              )}
            >
              {v.punto && <span className={cn("h-1.5 w-1.5 rounded-full", v.punto)} />}
              {v.rotulo}
              {v.cantidad !== undefined && (
                <span
                  className={cn(
                    "num text-[12px] tabular-nums",
                    on ? "text-ink-muted" : "text-ink-faint"
                  )}
                >
                  {v.cantidad.toLocaleString("es-AR")}
                </span>
              )}
            </button>
          )
        })}
      </nav>
      {extra && <div className="hidden shrink-0 pb-2.5 text-[12px] text-ink-muted sm:block">{extra}</div>}
    </div>
  )
}
