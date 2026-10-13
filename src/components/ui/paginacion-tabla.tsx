"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * El pie de las tablas de Contactos y el CRM, como en el boceto: "Mostrando 1
 * a 10 de 45 personas", los números de página y cuántas filas ver.
 *
 * Se dibuja siempre, aunque haya una sola página: el rótulo es la única forma
 * de saber cuántas filas hay, y un pie que aparece y desaparece mueve la tabla.
 */
export const FILAS_POR_PAGINA = [10, 25, 50] as const

export function PaginacionTabla({
  pagina,
  porPagina,
  total,
  unidad,
  onIr,
  onPorPagina,
  onPrecargar,
}: {
  pagina: number
  porPagina: number
  total: number
  /** "personas", "oportunidades". */
  unidad: string
  onIr: (p: number) => void
  onPorPagina: (n: number) => void
  /** Al pasar el mouse por una página: para tenerla lista antes del click. */
  onPrecargar?: (p: number) => void
}) {
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina))
  const desde = total === 0 ? 0 : (pagina - 1) * porPagina + 1
  const hasta = Math.min(pagina * porPagina, total)

  return (
    // El margen derecho es para el botón del asistente, que flota en esa
    // esquina: sin él tapaba "siguiente" justo cuando la tabla llega al pie.
    <div className="flex flex-col-reverse items-center justify-between gap-3 border-t border-line px-4 py-2.5 sm:flex-row sm:pr-24">
      <p className="num text-[12.5px] text-ink-muted">
        {total === 0
          ? `Sin ${unidad}`
          : `Mostrando ${desde.toLocaleString("es-AR")} a ${hasta.toLocaleString("es-AR")} de ${total.toLocaleString("es-AR")} ${unidad}`}
      </p>

      <div className="flex items-center gap-4">
        <label className="hidden items-center gap-1.5 text-[12.5px] text-ink-muted sm:flex">
          Filas
          <select
            value={porPagina}
            onChange={(e) => onPorPagina(Number(e.target.value))}
            className="h-7 cursor-pointer rounded-md border border-line bg-surface px-1.5 text-[12.5px] text-ink outline-none hover:border-line-strong"
          >
            {FILAS_POR_PAGINA.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>

        <nav className="flex items-center gap-0.5" aria-label="Páginas">
          <Paso
            onClick={() => onIr(pagina - 1)}
            onMouseEnter={() => onPrecargar?.(pagina - 1)}
            disabled={pagina <= 1}
            aria-label="Página anterior"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Paso>
          {numeros(pagina, totalPaginas).map((n, i) =>
            n === null ? (
              <span key={`gap-${i}`} className="w-7 text-center text-[12.5px] text-ink-faint">
                …
              </span>
            ) : (
              <Paso
                key={n}
                onClick={() => onIr(n)}
                onMouseEnter={() => onPrecargar?.(n)}
                activo={n === pagina}
                aria-current={n === pagina ? "page" : undefined}
              >
                {n}
              </Paso>
            )
          )}
          <Paso
            onClick={() => onIr(pagina + 1)}
            onMouseEnter={() => onPrecargar?.(pagina + 1)}
            disabled={pagina >= totalPaginas}
            aria-label="Página siguiente"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Paso>
        </nav>
      </div>
    </div>
  )
}

/** 1 2 3 4 5 … 12, con la actual siempre a la vista y los extremos fijos. */
function numeros(actual: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const medio = [actual - 1, actual, actual + 1].filter((n) => n > 1 && n < total)
  const lista: (number | null)[] = [1]
  if (medio[0] > 2) lista.push(null)
  lista.push(...medio)
  if (medio[medio.length - 1] < total - 1) lista.push(null)
  lista.push(total)
  return lista
}

function Paso({
  activo = false,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { activo?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "num flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 text-[12.5px] transition-colors disabled:pointer-events-none disabled:opacity-35",
        activo ? "bg-ink font-medium text-n-25" : "text-ink-secondary hover:bg-surface-muted hover:text-ink",
        className
      )}
      {...props}
    />
  )
}
