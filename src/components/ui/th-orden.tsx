"use client"

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"

import { cn } from "@/lib/utils"

export type Orden<C extends string> = { campo: C; dir: "asc" | "desc" } | null

/**
 * Un encabezado que ordena la tabla. Primer click: de la A a la Z; segundo: de
 * la Z a la A; tercero: vuelve al orden de siempre. La flecha se ve siempre en
 * la columna que ordena y, en las demás, al pasar el mouse.
 */
export function ThOrden<C extends string>({
  campo,
  orden,
  onOrdenar,
  children,
  className,
}: {
  campo: C
  orden: Orden<C>
  onOrdenar: (o: Orden<C>) => void
  children: React.ReactNode
  className?: string
}) {
  const activo = orden?.campo === campo
  const siguiente: Orden<C> = !activo
    ? { campo, dir: "asc" }
    : orden.dir === "asc"
      ? { campo, dir: "desc" }
      : null
  const Icono = !activo ? ArrowUpDown : orden.dir === "asc" ? ArrowUp : ArrowDown

  return (
    <th className={className} aria-sort={activo ? (orden.dir === "asc" ? "ascending" : "descending") : undefined}>
      <button
        type="button"
        onClick={() => onOrdenar(siguiente)}
        className={cn(
          "group/orden -mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:text-ink",
          activo && "text-ink"
        )}
      >
        {children}
        <Icono
          className={cn(
            "h-3 w-3 shrink-0 transition-opacity",
            activo ? "opacity-100" : "opacity-0 group-hover/orden:opacity-60"
          )}
        />
      </button>
    </th>
  )
}
