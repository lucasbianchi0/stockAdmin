"use client"

import { ChevronDown, X } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Un filtro chico, de los que van en fila al lado del buscador: "Vertical ▾"
 * vacío, "Vertical: Energía ×" puesto.
 *
 * Por debajo es un `<select>` nativo transparente encima de la píldora: en el
 * celular abre la rueda del sistema y no hay que resolver teclado ni foco.
 */
export function FiltroPill({
  rotulo,
  valor,
  onCambio,
  opciones,
}: {
  rotulo: string
  valor: string
  onCambio: (v: string) => void
  opciones: { valor: string; etiqueta: string }[]
}) {
  const elegida = opciones.find((o) => o.valor === valor)

  return (
    <span
      className={cn(
        "relative inline-flex h-8 shrink-0 items-center rounded-full border text-[12.5px] transition-colors",
        elegida
          ? "border-brand-200 bg-brand-50 text-brand-700"
          : "border-line bg-surface text-ink-secondary hover:border-line-strong hover:text-ink"
      )}
    >
      <span className="pointer-events-none flex items-center gap-1 pl-3 pr-2.5">
        {elegida ? (
          <>
            <span className="text-brand-700/70">{rotulo}:</span>
            <span className="max-w-[140px] truncate font-medium">{elegida.etiqueta}</span>
          </>
        ) : (
          <>
            {rotulo}
            <ChevronDown className="h-3 w-3 text-ink-faint" />
          </>
        )}
      </span>
      <select
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        aria-label={rotulo}
        className="absolute inset-0 cursor-pointer appearance-none opacity-0"
      >
        <option value="">Todos</option>
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.etiqueta}
          </option>
        ))}
      </select>
      {elegida && (
        <button
          type="button"
          onClick={() => onCambio("")}
          aria-label={`Quitar filtro ${rotulo}`}
          className="relative z-10 -ml-1 mr-1 rounded-full p-1 text-brand-700/60 transition-colors hover:bg-brand-100 hover:text-brand-700"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  )
}
